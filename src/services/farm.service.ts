import crypto from "crypto";
import { Types } from "mongoose";
import {
    EGG_ITEM_BY_SPECIES,
    FEED_SATIETY_BUMP,
    GOLDEN_GRASS_COST,
    GOLDEN_WHEAT_COST,
    HUNGER_DECAY_PER_HOUR,
    ITEM_KEYS,
    OFFCHAIN_SPAWN_BY_SPECIES,
    ON_CHAIN_TIERS,
    PREMIUM_ONCHAIN_SPAWN_BONUS,
    SPECIES,
    SPECIES_PRODUCT_CODE,
    farmSpawnDropQueueCapacityForLevel,
    isFarmOffchainQueueItemKey,
    levelFromExp,
    offChainSpawnChanceMultiplier,
    onChainSpawnChanceMultiplier,
    onChainTierIndex,
    premiumOnChainBonusActive,
    rollOnChainTier,
    spawnBalanceMultiplier,
    storageSlotsForLevel,
    type OnChainTierId,
    type SpeciesId,
    STARTER_EXP_MULT,
    STARTER_GOLD_MULT,
    STARTER_ONCHAIN_MULT,
} from "@fantastic-farm/shared";
import {
    clampNextSpawnAtMsForFastTest,
    hatchGoldEffective,
    hungerDecayPerHourEffective,
    premiumFeedDurationMsEffective,
    shopGoldUnitEffective,
    spawnIntervalMsFromGddHours,
    starterBonusDurationMs,
} from "../config/fastTest";
import { fantasticFarmEnv } from "../config/fantasticFarmEnv";
import {
    Animal,
    EggHatchBurn,
    FarmProductMintProofReservation,
    FarmProductMintTx,
    RESERVATION_TTL_MS,
    Item,
    User,
} from "../models";
import { ApiError } from "../utils/apiError";
import { ensureItemCatalog } from "./itemCatalog.service";
import { buildFarmProductMintProof, type FarmProductMintProofResponse } from "./mintProof.service";

async function createFarmRpcDeps() {
    const [{ SuiJsonRpcClient }, { normalizeSuiAddress }] = await Promise.all([
        import("@mysten/sui/jsonRpc"),
        import("@mysten/sui/utils"),
    ]);
    const client = new SuiJsonRpcClient({
        url: fantasticFarmEnv.rpcUrl,
        network: (fantasticFarmEnv.network ?? "testnet") as "mainnet" | "testnet" | "devnet" | "localnet",
    });
    return { client, normalizeSuiAddress };
}

let cachedFarmRpc: Awaited<ReturnType<typeof createFarmRpcDeps>> | null = null;

async function getFarmRpcDeps() {
    if (!cachedFarmRpc) cachedFarmRpc = await createFarmRpcDeps();
    return cachedFarmRpc;
}

function isMongoDuplicateKeyError(err: unknown): boolean {
    return Boolean(err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000);
}

/** Concurrent `save()` on the same User bumps `__v` — second writer gets VersionError. */
function isMongooseVersionError(err: unknown): boolean {
    return typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "VersionError";
}

function speciesFromEggNftSpeciesCode(code: number): SpeciesId | null {
    const row = (Object.entries(SPECIES_PRODUCT_CODE) as [SpeciesId, number][]).find(([, v]) => v === code);
    return row?.[0] ?? null;
}

function rng(): number {
    const b = crypto.randomBytes(4).readUInt32BE(0);
    return b / 0xffffffff;
}

type InvSlot = { itemId: Types.ObjectId; quantity: number };

type PendingOffChainFarmDropDoc = {
    itemKey: string;
    quantity: number;
    queuedAt?: Date;
};

type PendingMintDoc = {
    _id?: Types.ObjectId;
    species?: string;
    tierId?: string;
    createdAt?: Date;
};

function queuedOffFarmDropMs(o: PendingOffChainFarmDropDoc): number {
    if (o.queuedAt) return new Date(o.queuedAt).getTime();
    return 0;
}

function pendingMintQueuedMs(m: PendingMintDoc): number {
    if (m.createdAt) return new Date(m.createdAt).getTime();
    if (m._id) return m._id.getTimestamp().getTime();
    return 0;
}

/**
 * Consume from the front of the queue (FIFO): only contiguous matching `itemKey`, then continue with remaining slots.
 */
function consumeOffChainFifoByItemKey(
    slots: PendingOffChainFarmDropDoc[],
    itemKey: string,
    wantQty: number,
): { next: PendingOffChainFarmDropDoc[]; taken: number } {
    let remaining = wantQty;
    const next: PendingOffChainFarmDropDoc[] = [];
    for (const slot of slots) {
        if (remaining <= 0 || slot.itemKey !== itemKey) {
            next.push(slot);
            continue;
        }
        const take = Math.min(slot.quantity, remaining);
        const left = slot.quantity - take;
        remaining -= take;
        if (left > 0) {
            next.push({ ...slot, quantity: left });
        }
    }
    return { next, taken: wantQty - remaining };
}

export async function enforceFarmDropQueueCap(userId: string): Promise<void> {
    await ensureItemCatalog();
    const maxAttempts = 16;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const pulledMintIds: string[] = [];
        let user = await User.findById(userId);
        if (!user) return;

        try {
            for (;;) {
                const lvl = levelFromExp(user.exp ?? 0);
                const cap = farmSpawnDropQueueCapacityForLevel(lvl);

                let offs = [...((user.pendingOffChainFarmDrops ?? []) as unknown as PendingOffChainFarmDropDoc[])];
                const mints = [...((user.pendingFarmProductMints ?? []) as unknown as PendingMintDoc[])];

                if (offs.length + mints.length <= cap) {
                    user.pendingOffChainFarmDrops = offs;
                    user.pendingFarmProductMints = mints;
                    user.markModified("pendingOffChainFarmDrops");
                    user.markModified("pendingFarmProductMints");
                    await user.save();
                    if (pulledMintIds.length > 0) {
                        await FarmProductMintProofReservation.deleteMany({
                            userId: user._id,
                            pendingMintId: { $in: [...new Set(pulledMintIds)] },
                        });
                    }
                    return;
                }

                const offHead = offs[0];
                const mintHead = mints[0];
                let evictMint: boolean;
                if (!offHead) evictMint = true;
                else if (!mintHead) evictMint = false;
                else {
                    const tMint = pendingMintQueuedMs(mintHead);
                    const tOff = queuedOffFarmDropMs(offHead);
                    evictMint = tMint < tOff;
                }

                if (evictMint) {
                    const head = mints.shift();
                    if (head?._id) pulledMintIds.push(String(head._id));
                } else {
                    offs.shift();
                }

                user.pendingOffChainFarmDrops = offs;
                user.pendingFarmProductMints = mints;
                user.markModified("pendingOffChainFarmDrops");
                user.markModified("pendingFarmProductMints");
                await user.save();

                user = await User.findById(userId);
                if (!user) return;
            }
        } catch (err: unknown) {
            if (isMongooseVersionError(err) && attempt < maxAttempts - 1) continue;
            throw err;
        }
    }
    throw new ApiError(409, "Farm queue is busy — please retry in a moment.");
}

async function pushOffChainFarmSpawnDrop(userId: string, itemKey: string, quantity: number): Promise<void> {
    if (quantity < 1) return;
    await User.findByIdAndUpdate(userId, {
        $push: {
            pendingOffChainFarmDrops: {
                itemKey,
                quantity,
                queuedAt: new Date(),
            },
        },
    });
    await enforceFarmDropQueueCap(userId);
}

export async function applyFarmOffchainQueueCollect(
    userId: string,
    entries: { itemKey: string; quantity: number }[],
): Promise<void> {
    const spawnRelated = entries.filter((e) => isFarmOffchainQueueItemKey(e.itemKey.trim()));
    if (spawnRelated.length === 0) return;
    await ensureItemCatalog();

    const needByKey = new Map<string, number>();
    for (const { itemKey, quantity } of spawnRelated) {
        const k = itemKey.trim();
        needByKey.set(k, (needByKey.get(k) ?? 0) + quantity);
    }

    const maxAttempts = 12;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const user = await User.findById(userId);
        if (!user) throw new ApiError(404, "User not found");

        let slots = [...((user.pendingOffChainFarmDrops ?? []) as unknown as PendingOffChainFarmDropDoc[])];
        for (const [itemKey, want] of needByKey.entries()) {
            const { next, taken } = consumeOffChainFifoByItemKey(slots, itemKey, want);
            if (taken < want) {
                throw new ApiError(
                    400,
                    `Not enough "${itemKey}" on the farm (${taken}/${want} queued). Harvest more or refresh.`,
                );
            }
            slots = next;
        }

        user.pendingOffChainFarmDrops = slots;
        user.markModified("pendingOffChainFarmDrops");
        try {
            await user.save();
            for (const [itemKey, want] of needByKey.entries()) {
                await addInventory(userId, itemKey, want);
            }
            return;
        } catch (err: unknown) {
            if (isMongooseVersionError(err) && attempt < maxAttempts - 1) continue;
            throw err;
        }
    }
    throw new ApiError(409, "Could not update farm queue — please retry.");
}

async function itemObjectId(itemKey: string): Promise<Types.ObjectId> {
    const doc = await Item.findOne({ itemKey }).lean();
    if (!doc?._id) {
        throw new ApiError(500, `Catalog missing item: ${itemKey}`);
    }
    return doc._id as Types.ObjectId;
}

async function addInventory(userId: string, itemKey: string, quantity: number): Promise<void> {
    if (quantity < 1) return;
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    const oid = await itemObjectId(itemKey);
    const inv = (user.inventory ?? []) as InvSlot[];
    const hit = inv.find((s) => String(s.itemId) === String(oid));
    if (hit) hit.quantity += quantity;
    else inv.push({ itemId: oid, quantity });
    user.inventory = inv;
    user.markModified("inventory");
    await user.save();
}

async function takeInventory(userId: string, itemKey: string, quantity: number): Promise<void> {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    const oid = await itemObjectId(itemKey);
    const inv = (user.inventory ?? []) as InvSlot[];
    const hit = inv.find((s) => String(s.itemId) === String(oid));
    if (!hit || hit.quantity < quantity) {
        throw new ApiError(400, `Not enough ${itemKey}`);
    }
    hit.quantity -= quantity;
    user.inventory = inv.filter((s) => s.quantity > 0);
    user.markModified("inventory");
    await user.save();
}

async function inventoryQty(userId: string, itemKey: string): Promise<number> {
    const oid = await itemObjectId(itemKey);
    const user = await User.findById(userId).lean();
    if (!user?.inventory) return 0;
    const hit = (user.inventory as InvSlot[]).find((s) => String(s.itemId) === String(oid));
    return hit?.quantity ?? 0;
}

function starterBonusActive(user: { starterBonusUntil?: Date | null }): boolean {
    if (!user.starterBonusUntil) return false;
    return Date.now() < new Date(user.starterBonusUntil).getTime();
}

function totalStorageUsed(animals: Array<{ species: string }>): number {
    let s = 0;
    for (const a of animals) {
        const sp = SPECIES[a.species as SpeciesId];
        if (sp) s += sp.storageCost;
    }
    return s;
}

export async function processFarmForUser(userId: string): Promise<void> {
    await ensureItemCatalog();
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");

    const animals = await Animal.find({ ownerId: user._id });
    const now = Date.now();
    const lvl = levelFromExp(user.exp ?? 0);
    const maxSlots = storageSlotsForLevel(lvl);
    const spawnBal = spawnBalanceMultiplier(maxSlots);

    for (const animal of animals) {
        const species = animal.species as SpeciesId;
        const cfg = SPECIES[species];
        if (!cfg) continue;

        const nextSpawnMs = new Date(animal.nextSpawnAt).getTime();
        const clampedNext = clampNextSpawnAtMsForFastTest(nextSpawnMs, now, cfg.spawnHours);
        if (clampedNext !== nextSpawnMs) {
            animal.nextSpawnAt = new Date(clampedNext);
        }

        const lastTick = new Date(animal.lastSatietyTickAt ?? animal.createdAt ?? Date.now()).getTime();
        const hours = Math.max(0, (now - lastTick) / 3_600_000);
        if (hours > 0) {
            let sat01 = (animal.satiety ?? 100) / 100 - hours * hungerDecayPerHourEffective();
            sat01 = Math.max(0, Math.min(1, sat01));
            animal.satiety = Math.round(sat01 * 1000) / 10;
            animal.lastSatietyTickAt = new Date(now);
        }

        let guard = 0;
        while (now >= new Date(animal.nextSpawnAt).getTime() && guard < 64) {
            guard++;
            const s01 = (animal.satiety ?? 0) / 100;

            const offP = offChainSpawnChanceMultiplier(s01) * spawnBal;
            if (rng() < offP) {
                const drop = OFFCHAIN_SPAWN_BY_SPECIES[species];
                await pushOffChainFarmSpawnDrop(userId, drop.itemKey, drop.qty);
            }

            let onP =
                onChainSpawnChanceMultiplier(s01) * cfg.onChainBaseChance * spawnBal;
            if (premiumOnChainBonusActive(now, animal.premiumFeedUntil?.getTime())) {
                onP = Math.min(1, onP + PREMIUM_ONCHAIN_SPAWN_BONUS);
            }
            if (animal.isStarter && species === "chicken") {
                onP *= STARTER_ONCHAIN_MULT;
            }
            if (rng() < onP) {
                const tier = rollOnChainTier(rng);
                await User.findByIdAndUpdate(userId, {
                    $push: {
                        pendingFarmProductMints: {
                            species,
                            tierId: tier.id,
                        },
                    },
                });
                await enforceFarmDropQueueCap(userId);
            }

            const next =
                new Date(animal.nextSpawnAt).getTime() + spawnIntervalMsFromGddHours(cfg.spawnHours);
            animal.nextSpawnAt = new Date(next);
        }

        await animal.save();
    }
}

export async function feedAnimal(params: {
    userId: string;
    animalId: string;
    premium: boolean;
}): Promise<void> {
    await ensureItemCatalog();
    const animal = await Animal.findOne({
        _id: params.animalId,
        ownerId: new Types.ObjectId(params.userId),
    });
    if (!animal) throw new ApiError(404, "Animal not found");
    const species = animal.species as SpeciesId;
    const cfg = SPECIES[species];

    if (params.premium) {
        const key = cfg.feedKey === "wheat" ? ITEM_KEYS.goldenWheat : ITEM_KEYS.goldenGrass;
        // const cost = cfg.feedKey === "wheat" ? GOLDEN_WHEAT_COST : GOLDEN_GRASS_COST;
        if ((await inventoryQty(params.userId, key)) < 1) {
            throw new ApiError(400, `Need 1 ${key} for premium feed`);
        }
        await takeInventory(params.userId, key, 1);
        animal.premiumFeedUntil = new Date(Date.now() + premiumFeedDurationMsEffective());
    } else {
        const key = cfg.feedKey === "wheat" ? ITEM_KEYS.wheat : ITEM_KEYS.grass;
        if ((await inventoryQty(params.userId, key)) < 1) {
            throw new ApiError(400, `Need 1 ${key} to feed`);
        }
        await takeInventory(params.userId, key, 1);
    }

    let sat01 = (animal.satiety ?? 0) / 100 + FEED_SATIETY_BUMP;
    sat01 = Math.min(1, sat01);
    animal.satiety = Math.round(sat01 * 1000) / 10;
    animal.lastFed = new Date();
    animal.lastSatietyTickAt = new Date();
    await animal.save();
}

export async function buyFeed(userId: string, itemKey: string, quantity: number): Promise<void> {
    await ensureItemCatalog();
    if (quantity < 1) throw new ApiError(400, "Invalid quantity");
    const prices: Record<string, number> = {
        [ITEM_KEYS.wheat]: SPECIES.chicken.feedGoldCost,
        [ITEM_KEYS.grass]: SPECIES.goat.feedGoldCost,
        [ITEM_KEYS.goldenWheat]: GOLDEN_WHEAT_COST,
        [ITEM_KEYS.goldenGrass]: GOLDEN_GRASS_COST,
    };
    const unit = prices[itemKey];
    if (unit === undefined) throw new ApiError(400, "Unknown shop item");
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    const unitEff = shopGoldUnitEffective(unit);
    const cost = unitEff * quantity;
    if ((user.gold ?? 0) < cost) throw new ApiError(400, "Not enough gold");
    user.gold = (user.gold ?? 0) - cost;
    await user.save();
    await addInventory(userId, itemKey, quantity);
}

export async function sellItem(userId: string, itemKey: string, quantity: number): Promise<void> {
    await ensureItemCatalog();
    if (quantity < 1) throw new ApiError(400, "Invalid quantity");
    const item = await Item.findOne({ itemKey }).lean();
    if (!item) throw new ApiError(404, "Unknown item");
    const baseGold = item.sellGold ?? 0;
    if (baseGold <= 0) throw new ApiError(400, "Item not sellable for gold");
    await takeInventory(userId, itemKey, quantity);

    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    let mult = 1;
    let expMult = 1;
    if (starterBonusActive(user)) {
        mult = STARTER_GOLD_MULT;
        expMult = STARTER_EXP_MULT;
    }
    user.gold = (user.gold ?? 0) + baseGold * quantity * mult;
    user.exp = (user.exp ?? 0) + Math.floor(1 * quantity * expMult);
    await user.save();
}

export async function convertOnChainItem(userId: string, itemKey: string, quantity: number): Promise<void> {
    await ensureItemCatalog();
    const item = await Item.findOne({ itemKey }).lean();
    if (!item || item.kind !== "on") throw new ApiError(400, "Not an on-chain convertible item");
    const fc = item.fcValue ?? 0;
    if (fc <= 0) throw new ApiError(400, "No FC value");
    await takeInventory(userId, itemKey, quantity);
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    let expMult = 1;
    if (starterBonusActive(user)) expMult = STARTER_EXP_MULT;
    const tierExp: Record<string, number> = Object.fromEntries(
        ON_CHAIN_TIERS.map((t) => [t.id, t.expOnConvert])
    );
    const tid = item.tierId ?? "";
    const expGain = (tierExp[tid] ?? 3) * quantity * expMult;
    user.fcBalance = (user.fcBalance ?? 0) + fc * quantity;
    user.exp = (user.exp ?? 0) + Math.floor(expGain);
    await user.save();
}

export async function hatchEgg(userId: string, eggItemKey: string): Promise<void> {
    await ensureItemCatalog();
    let species: SpeciesId | null = null;
    let isStarter = false;
    if (eggItemKey === ITEM_KEYS.starterEgg) {
        species = "chicken";
        isStarter = true;
    } else {
        const entry = (Object.entries(EGG_ITEM_BY_SPECIES) as [SpeciesId, string][]).find(
            ([, k]) => k === eggItemKey
        );
        if (!entry) throw new ApiError(400, "Unknown egg");
        species = entry[0];
    }
    const cfg = SPECIES[species];
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    const lvl = levelFromExp(user.exp ?? 0);
    const maxSlots = storageSlotsForLevel(lvl);
    const animals = await Animal.find({ ownerId: user._id });
    if (totalStorageUsed(animals) + cfg.storageCost > maxSlots) {
        throw new ApiError(400, "Not enough storage slots");
    }
    const hatchCost = hatchGoldEffective(cfg.hatchGold);
    if ((user.gold ?? 0) < hatchCost) throw new ApiError(400, "Not enough gold to hatch");
    await takeInventory(userId, eggItemKey, 1);
    user.gold = (user.gold ?? 0) - hatchCost;
    await user.save();

    const nextSpawn = new Date(Date.now() + spawnIntervalMsFromGddHours(cfg.spawnHours));
    await Animal.create({
        displayName: cfg.displayName,
        satiety: 100,
        lastFed: new Date(),
        lastSatietyTickAt: new Date(),
        nextSpawnAt: nextSpawn,
        species,
        isStarter,
        ownerId: user._id,
    });
}

/** Read pending mint entitlement without consuming it — on-chain mint first; finalize consumes after tx succeeds. */
export async function peekPendingFarmProductMint(
    userId: string,
    pendingMintId: string,
): Promise<{ species: SpeciesId; tierId: OnChainTierId }> {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    const list = [...(user.pendingFarmProductMints ?? [])];
    const ix = list.findIndex((p: { _id?: Types.ObjectId }) => String(p._id) === pendingMintId);
    if (ix < 0) throw new ApiError(400, "Pending mint not found");
    const row = list[ix] as { species: string; tierId: string };
    if (!SPECIES[row.species as SpeciesId]) throw new ApiError(400, "Invalid pending entry");
    if (!ON_CHAIN_TIERS.some((t) => t.id === row.tierId)) throw new ApiError(400, "Invalid pending tier");
    return { species: row.species as SpeciesId, tierId: row.tierId as OnChainTierId };
}

/**
 * Issues one proof per pending drop: blocks parallel `/mint-farm-product-proof` until reservation expires (~6 min)
 * or finalize clears it — prevents chaining multiple successful on-chain mints from one drop.
 */
export async function issueFarmProductMintProofWithReservation(
    userId: string,
    recipientWalletAddress: string,
    pendingMintId: string,
): Promise<FarmProductMintProofResponse> {
    await ensureItemCatalog();

    const pendingTrim = pendingMintId.trim();
    if (!pendingTrim) throw new ApiError(400, "pendingMintId required");

    const uid = new Types.ObjectId(userId);

    await FarmProductMintProofReservation.deleteMany({
        userId: uid,
        pendingMintId: pendingTrim,
        expiresAt: { $lt: new Date() },
    });

    const active = await FarmProductMintProofReservation.findOne({
        userId: uid,
        pendingMintId: pendingTrim,
        expiresAt: { $gte: new Date() },
    }).lean();

    if (active) {
        throw new ApiError(
            400,
            "Mint proof already issued for this drop — sign that transaction, call finalize after it succeeds, or wait for the reservation to expire before requesting a new proof.",
        );
    }

    const entry = await peekPendingFarmProductMint(userId, pendingTrim);
    const speciesCode = SPECIES_PRODUCT_CODE[entry.species];
    const tierCode = onChainTierIndex(entry.tierId);

    const data = await buildFarmProductMintProof(recipientWalletAddress, speciesCode, tierCode);

    await FarmProductMintProofReservation.findOneAndUpdate(
        { userId: uid, pendingMintId: pendingTrim },
        {
            userId: uid,
            pendingMintId: pendingTrim,
            expectedNonce: data.nonce,
            expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        },
        { upsert: true },
    );

    return data;
}

/** DB checks (chuồng + hatch gold); preflight uses default messages; finalize after burn passes `afterEggBurn`. */
export async function assertCanFinalizeEggNftHatchForSpecies(
    userId: string,
    jwtWalletAddress: string,
    species: SpeciesId,
    opts?: { afterEggBurn?: boolean },
): Promise<{ hatchGold: number }> {
    const cfg = SPECIES[species];
    if (!cfg) throw new ApiError(400, "Invalid species");

    const { normalizeSuiAddress } = await getFarmRpcDeps();
    const jwtNorm = normalizeSuiAddress(jwtWalletAddress.trim()).toLowerCase();
    if (!jwtNorm) throw new ApiError(400, "wallet address required");

    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    if (normalizeSuiAddress(user.walletAddress ?? "").toLowerCase() !== jwtNorm) {
        throw new ApiError(403, "Account wallet mismatch");
    }

    const lvl = levelFromExp(user.exp ?? 0);
    const maxSlots = storageSlotsForLevel(lvl);
    const animals = await Animal.find({ ownerId: user._id });
    if (totalStorageUsed(animals) + cfg.storageCost > maxSlots) {
        throw new ApiError(
            400,
            opts?.afterEggBurn
                ? "Not enough storage slots — egg already burned on chain; free a slot and POST /game/hatch-onchain again with the same tx digest."
                : "Not enough storage slots — free a slot before hatch",
        );
    }

    const hatchGold = hatchGoldEffective(cfg.hatchGold);
    if ((user.gold ?? 0) < hatchGold) {
        throw new ApiError(
            400,
            opts?.afterEggBurn
                ? `Not enough gold to finalize hatch (need ${hatchGold}g). The egg was already burned on chain.`
                : `Not enough gold to hatch (need ${hatchGold}g)`,
        );
    }
    return { hatchGold };
}

/** Server-side hatch gate before wallet burns EggNft — `speciesCode` 0..3 matching on-chain egg. */
export async function runEggNftHatchPrecheckDb(
    userId: string,
    jwtWalletAddress: string,
    speciesCodeRaw: number,
): Promise<{ hatchGold: number; species: SpeciesId }> {
    await ensureItemCatalog();
    const code = Math.trunc(Number(speciesCodeRaw));
    if (!Number.isFinite(code) || code < 0 || code > 3) throw new ApiError(400, "speciesCode must be 0–3");
    const species = speciesFromEggNftSpeciesCode(code);
    if (!species || !SPECIES[species]) throw new ApiError(400, "Invalid speciesCode");
    const { hatchGold } = await assertCanFinalizeEggNftHatchForSpecies(userId, jwtWalletAddress, species);
    return { hatchGold, species };
}

const FARM_PRODUCT_MINT_SUFFIX = "::farm_registry::FarmProductMinted";

function parseFarmProductMintedPayload(json: Record<string, unknown>): {
    recipient: string;
    speciesCode: number;
    tier: number;
    nonce: string;
} | null {
    const recipient = json.recipient;
    if (typeof recipient !== "string" || !recipient.trim()) return null;
    const scRaw = json.species_code;
    const tierRaw = json.tier;
    const speciesCode =
        typeof scRaw === "number"
            ? scRaw
            : typeof scRaw === "string"
              ? Number.parseInt(scRaw, 10)
              : NaN;
    const tier =
        typeof tierRaw === "number"
            ? tierRaw
            : typeof tierRaw === "string"
              ? Number.parseInt(tierRaw, 10)
              : NaN;
    if (!Number.isFinite(speciesCode) || speciesCode < 0 || speciesCode > 255) return null;
    if (!Number.isFinite(tier) || tier < 0 || tier > 255) return null;
    const nonce = normalizeNonceFromEventJson(json.nonce);
    if (!nonce) return null;
    return { recipient: recipient.trim(), speciesCode, tier, nonce };
}

function normalizeNonceFromEventJson(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null;
    try {
        if (typeof raw === "bigint") return raw.toString();
        if (typeof raw === "number" && Number.isFinite(raw)) return BigInt(Math.trunc(raw)).toString();
        if (typeof raw === "string") {
            const t = raw.trim();
            if (/^\d+$/.test(t)) return t;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * After wallet `farm_registry::mint_farm_product`, reconcile DB: removes matching pending row. Idempotent per `txDigest`.
 */
export async function finalizeFarmProductMintFromTx(
    userId: string,
    jwtWalletAddress: string,
    txDigestRaw: string,
    pendingMintId: string,
): Promise<void> {
    await ensureItemCatalog();
    const digest = txDigestRaw.trim();
    if (!digest) throw new ApiError(400, "txDigest required");
    const pendingTrim = pendingMintId.trim();
    if (!pendingTrim) throw new ApiError(400, "pendingMintId required");

    const expectedPkg = fantasticFarmEnv.packageId.trim();
    if (!expectedPkg) throw new ApiError(503, "FANTASTIC_FARM_PACKAGE_ID not configured");

    const { client, normalizeSuiAddress } = await getFarmRpcDeps();
    const jwtNorm = normalizeSuiAddress(jwtWalletAddress.trim()).toLowerCase();

    const existing = await FarmProductMintTx.findOne({ txDigest: digest }).lean();
    if (existing) {
        if (String(existing.userId) !== userId) {
            throw new ApiError(403, "This mint transaction belongs to another account");
        }
        const oid = new Types.ObjectId(existing.pendingMintId);
        await User.updateOne({ _id: new Types.ObjectId(userId) }, { $pull: { pendingFarmProductMints: { _id: oid } } });
        await FarmProductMintProofReservation.deleteMany({
            userId: new Types.ObjectId(userId),
            pendingMintId: existing.pendingMintId,
        });
        return;
    }

    const pending = await peekPendingFarmProductMint(userId, pendingTrim);
    const expectedSpeciesCode = SPECIES_PRODUCT_CODE[pending.species];
    const expectedTier = onChainTierIndex(pending.tierId);

    let txBlock;
    try {
        txBlock = await client.getTransactionBlock({
            digest,
            options: { showEffects: true, showEvents: true },
        });
    } catch {
        throw new ApiError(400, "Could not load transaction — check digest and RPC");
    }

    if (!txBlock.effects || txBlock.effects.status.status !== "success") {
        throw new ApiError(400, "Transaction did not succeed on chain");
    }

    const wantPkg = normalizeSuiAddress(expectedPkg);
    let parsed: { recipient: string; speciesCode: number; tier: number; nonce: string } | null = null;

    for (const ev of txBlock.events ?? []) {
        if (!ev.type.endsWith(FARM_PRODUCT_MINT_SUFFIX)) continue;
        if (normalizeSuiAddress(ev.packageId) !== wantPkg) continue;
        const j = ev.parsedJson;
        if (!j || typeof j !== "object") continue;
        parsed = parseFarmProductMintedPayload(j as Record<string, unknown>);
        if (parsed) break;
    }

    if (!parsed) {
        throw new ApiError(
            400,
            `No FarmProductMinted event for this package in the transaction (${wantPkg.slice(0, 10)}…)`,
        );
    }

    if (normalizeSuiAddress(parsed.recipient).toLowerCase() !== jwtNorm) {
        throw new ApiError(403, "Mint recipient does not match your linked wallet");
    }
    if (parsed.speciesCode !== expectedSpeciesCode || parsed.tier !== expectedTier) {
        throw new ApiError(400, "On-chain mint does not match this pending drop (species/tier mismatch)");
    }

    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    if (normalizeSuiAddress(user.walletAddress ?? "").toLowerCase() !== jwtNorm) {
        throw new ApiError(403, "User wallet does not match mint transaction");
    }

    const reservation = await FarmProductMintProofReservation.findOne({
        userId: user._id,
        pendingMintId: pendingTrim,
    }).lean();

    if (!reservation) {
        throw new ApiError(
            400,
            "No mint proof reservation for this drop — call POST /onchain/mint-farm-product-proof first.",
        );
    }

    if (parsed.nonce !== reservation.expectedNonce) {
        throw new ApiError(
            400,
            "Mint nonce does not match the proof issued for this drop — request a fresh proof or use the correct transaction digest.",
        );
    }

    try {
        await FarmProductMintTx.create({
            txDigest: digest,
            userId: user._id,
            pendingMintId: pendingTrim,
        });
    } catch (err: unknown) {
        if (isMongoDuplicateKeyError(err)) {
            const dup = await FarmProductMintTx.findOne({ txDigest: digest }).lean();
            if (dup && String(dup.userId) === userId) {
                const pullOid = new Types.ObjectId(dup.pendingMintId);
                await User.updateOne(
                    { _id: user._id },
                    { $pull: { pendingFarmProductMints: { _id: pullOid } } },
                );
                await FarmProductMintProofReservation.deleteMany({
                    userId: user._id,
                    pendingMintId: dup.pendingMintId,
                });
                return;
            }
            throw new ApiError(403, "This mint transaction was already finalized");
        }
        throw err;
    }

    const pullOid = new Types.ObjectId(pendingTrim);
    const pullRes = await User.updateOne(
        {
            _id: user._id,
            pendingFarmProductMints: {
                $elemMatch: {
                    _id: pullOid,
                    species: pending.species,
                    tierId: pending.tierId,
                },
            },
        },
        { $pull: { pendingFarmProductMints: { _id: pullOid } } },
    );
    if (pullRes.modifiedCount === 0) {
        throw new ApiError(400, "Pending mint could not be removed — refresh game state");
    }
    await FarmProductMintProofReservation.deleteMany({
        userId: user._id,
        pendingMintId: pendingTrim,
    });
}

const EGG_BURN_HATCH_STRUCT_SUFFIX = "::farm_nft::EggBurnedForHatch";

function parseEggBurnHatchPayload(json: Record<string, unknown>): { speciesCode: number; owner: string } | null {
    const codeRaw = json.species_code;
    const ownerRaw = json.owner;
    const speciesCode =
        typeof codeRaw === "number"
            ? codeRaw
            : typeof codeRaw === "string"
              ? Number.parseInt(codeRaw, 10)
              : NaN;
    if (!Number.isFinite(speciesCode) || speciesCode < 0 || speciesCode > 255) return null;
    if (typeof ownerRaw !== "string" || !ownerRaw.trim()) return null;
    return { speciesCode, owner: ownerRaw.trim() };
}

/**
 * After wallet calls `farm_nft::burn_egg_for_hatch`, pass the successful tx digest: BE verifies the burn event,
 * charges `hatchGold`, creates DB animal. Idempotent per `txDigest`.
 *
 * `EggHatchBurn` is inserted before deductions; any failure afterward rolls back burn record + restores gold so
 * the client can retry (egg is already burned on chain).
 */
export async function finalizeHatchFromBurnedEggNftTx(userId: string, walletAddress: string, txDigestRaw: string) {
    await ensureItemCatalog();
    const txDigest = txDigestRaw.trim();
    if (!txDigest) throw new ApiError(400, "txDigest required");

    const expectedPkg = fantasticFarmEnv.packageId.trim();
    if (!expectedPkg) throw new ApiError(503, "FANTASTIC_FARM_PACKAGE_ID not configured");

    const { client, normalizeSuiAddress } = await getFarmRpcDeps();
    const walletNorm = normalizeSuiAddress(walletAddress.trim()).toLowerCase();
    if (!walletNorm) throw new ApiError(400, "wallet address required");

    const existingBurn = await EggHatchBurn.findOne({ txDigest }).lean();
    if (existingBurn) {
        if (String(existingBurn.userId) !== userId) {
            throw new ApiError(403, "This hatch transaction belongs to another account");
        }
        return;
    }

    let txBlock;
    try {
        txBlock = await client.getTransactionBlock({
            digest: txDigest,
            options: { showEffects: true, showEvents: true },
        });
    } catch {
        throw new ApiError(400, "Could not load transaction — check digest and RPC");
    }

    if (!txBlock.effects || txBlock.effects.status.status !== "success") {
        throw new ApiError(400, "Transaction did not succeed on chain");
    }

    const wantPkg = normalizeSuiAddress(expectedPkg);
    let speciesCodeFound: number | null = null;

    for (const ev of txBlock.events ?? []) {
        if (!ev.type.endsWith(EGG_BURN_HATCH_STRUCT_SUFFIX)) continue;
        if (normalizeSuiAddress(ev.packageId) !== wantPkg) continue;

        const j = ev.parsedJson;
        if (!j || typeof j !== "object") continue;
        const parsed = parseEggBurnHatchPayload(j as Record<string, unknown>);
        if (!parsed) continue;

        if (normalizeSuiAddress(parsed.owner).toLowerCase() !== walletNorm) {
            throw new ApiError(403, "Burn transaction sender address does not match your linked wallet");
        }
        speciesCodeFound = parsed.speciesCode;
        break;
    }

    if (speciesCodeFound === null) {
        throw new ApiError(
            400,
            `No EggBurnedForHatch event for this package in the transaction (${wantPkg.slice(0, 10)}…)`,
        );
    }

    const species = speciesFromEggNftSpeciesCode(speciesCodeFound);
    if (!species || !SPECIES[species]) {
        throw new ApiError(400, "Unknown egg species_code in burn event");
    }

    const { hatchGold: hatchCost } = await assertCanFinalizeEggNftHatchForSpecies(
        userId,
        walletAddress,
        species,
        { afterEggBurn: true },
    );
    const cfg = SPECIES[species];

    try {
        await EggHatchBurn.create({ txDigest, userId: new Types.ObjectId(userId) });
    } catch (err: unknown) {
        if (isMongoDuplicateKeyError(err)) {
            const again = await EggHatchBurn.findOne({ txDigest }).lean();
            if (again && String(again.userId) === userId) return;
            throw new ApiError(403, "This hatch transaction was already used");
        }
        throw err;
    }

    const user = await User.findById(userId);
    if (!user) {
        await EggHatchBurn.deleteOne({ txDigest }).catch(() => {
            /* ignore */
        });
        throw new ApiError(404, "User not found");
    }

    const goldBefore = user.gold ?? 0;
    try {
        user.gold = goldBefore - hatchCost;
        await user.save();

        const nextSpawn = new Date(Date.now() + spawnIntervalMsFromGddHours(cfg.spawnHours));
        await Animal.create({
            displayName: cfg.displayName,
            satiety: 100,
            lastFed: new Date(),
            lastSatietyTickAt: new Date(),
            nextSpawnAt: nextSpawn,
            species,
            isStarter: false,
            ownerId: user._id,
        });
    } catch (e: unknown) {
        await EggHatchBurn.deleteOne({ txDigest }).catch(() => {
            /* ignore */
        });
        await User.updateOne({ _id: user._id }, { $set: { gold: goldBefore } }).catch(() => {
            /* ignore */
        });
        throw e;
    }
}

export async function grantStarterPack(userId: string): Promise<void> {
    await ensureItemCatalog();
    const until = new Date(Date.now() + starterBonusDurationMs());
    await User.findByIdAndUpdate(userId, { starterBonusUntil: until });
    await addInventory(userId, ITEM_KEYS.starterEgg, 1);
}

/** @deprecated Prefer `peekPendingFarmProductMint` + on-chain mint + `finalizeFarmProductMintFromTx`. */
export async function popPendingFarmProductMint(
    userId: string,
    pendingMintId: string,
): Promise<{ species: SpeciesId; tierId: OnChainTierId }> {
    const data = await peekPendingFarmProductMint(userId, pendingMintId);
    const oid = new Types.ObjectId(pendingMintId);
    const r = await User.updateOne(
        { _id: new Types.ObjectId(userId), pendingFarmProductMints: { $elemMatch: { _id: oid } } },
        { $pull: { pendingFarmProductMints: { _id: oid } } },
    );
    if (r.modifiedCount === 0) {
        throw new ApiError(400, "Pending mint could not be removed");
    }
    return data;
}

export async function verifyClientHash(userId: string, clientHash: string, ts: number): Promise<void> {
    if (!clientHash || typeof clientHash !== "string" || clientHash.length > 256) {
        throw new ApiError(400, "Invalid hash");
    }
    const skew = Math.abs(Date.now() - ts);
    if (!Number.isFinite(ts) || skew > 5 * 60_000) {
        throw new ApiError(400, "Stale or invalid timestamp");
    }
    const secret = process.env.FARM_HASH_SECRET ?? "dev-farm-hash-secret";
    const expected = crypto.createHmac("sha256", secret).update(`${userId}:${ts}`).digest("hex");
    if (expected !== clientHash) {
        throw new ApiError(401, "Hash mismatch");
    }
}
