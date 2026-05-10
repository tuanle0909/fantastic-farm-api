import { Types } from "mongoose";
import {
    farmProductDisplayName,
    farmSpawnDropQueueCapacityForLevel,
    isFarmOffchainQueueItemKey,
    levelFromExp,
    ON_CHAIN_TIERS,
    storageSlotsForLevel,
    type OnChainTierId,
    type SpeciesId,
} from "@fantastic-farm/shared";
import { isFastTestEnabled } from "../config/fastTest";
import { Animal, Item, User } from "../models";
import { ApiError } from "../utils/apiError";
import { processFarmForUser, applyFarmOffchainQueueCollect } from "./farm.service";

export type InventoryCollectEntry = {
    itemKey: string;
    quantity?: number;
};

function normalizeCollectEntries(body: unknown): InventoryCollectEntry[] {
    if (body === null || body === undefined || typeof body !== "object") {
        throw new ApiError(400, "Invalid inventory payload");
    }

    const o = body as Record<string, unknown>;

    if (Array.isArray(o.items)) {
        return o.items.map((entry, i) => {
            if (!entry || typeof entry !== "object") {
                throw new ApiError(400, `Invalid items[${i}]`);
            }
            const e = entry as Record<string, unknown>;
            return parseSingleEntry(e, `items[${i}]`);
        });
    }

    return [parseSingleEntry(o, "body")];
}

function parseSingleEntry(e: Record<string, unknown>, label: string): InventoryCollectEntry {
    const itemKey =
        typeof e.itemKey === "string" ? e.itemKey.trim() : typeof e.itemId === "string" ? e.itemId.trim() : "";

    if (!itemKey) {
        throw new ApiError(400, `${label}: itemKey is required`);
    }

    let quantity = 1;
    if (e.quantity !== undefined) {
        if (typeof e.quantity !== "number" || !Number.isFinite(e.quantity)) {
            throw new ApiError(400, `${label}: quantity must be a number`);
        }
        quantity = Math.floor(e.quantity);
    }

    if (quantity < 1) {
        throw new ApiError(400, `${label}: quantity must be at least 1`);
    }

    return { itemKey, quantity };
}

/**
 * Applies farm-queue collect for spawned products (`egg`, `goat_milk`, etc.) then optional direct inventory
 * merges for keys not on the spawn queue manifest (starter eggs, feeds, legacy Unity payloads).
 */
export const collectItemsForUser = async (userId: string, body: unknown) => {
    const id = userId.trim();
    if (!id) {
        throw new ApiError(400, "User id is required");
    }

    const entries = normalizeCollectEntries(body);
    if (entries.length === 0) {
        throw new ApiError(400, "No items to collect");
    }

    await processFarmForUser(id);

    const fromQueue = entries.filter((e) => isFarmOffchainQueueItemKey(e.itemKey.trim()));
    const directAdds = entries.filter((e) => !isFarmOffchainQueueItemKey(e.itemKey.trim()));

    if (fromQueue.length > 0) {
        await applyFarmOffchainQueueCollect(
            id,
            fromQueue.map((e) => ({ itemKey: e.itemKey, quantity: e.quantity ?? 1 })),
        );
    }

    let user = await User.findById(id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const inventory = [...(user.inventory ?? [])];

    for (const { itemKey, quantity } of directAdds) {
        let item = await Item.findOne({ itemKey });
        if (!item) {
            item = await Item.create({
                itemKey,
                name: itemKey,
                description: "",
                kind: "off",
            });
        }

        const itemObjectId = item._id as Types.ObjectId;
        const existing = inventory.find(
            (slot: { itemId: Types.ObjectId; quantity: number }) => String(slot.itemId) === String(itemObjectId),
        );

        if (existing) {
            existing.quantity += quantity;
        } else {
            inventory.push({
                itemId: itemObjectId,
                quantity,
            });
        }
    }

    if (directAdds.length > 0) {
        user.inventory = inventory;
        user.markModified("inventory");
        await user.save();
    }

    const updated = await User.findById(id).populate("inventory.itemId").lean();
    if (!updated) {
        throw new ApiError(500, "User update failed");
    }

    return {
        user: updated,
        inventory: updated.inventory ?? [],
    };
};

export const getGameLoadData = async (userId: string) => {
    const id = userId.trim();

    if (!id) {
        throw new ApiError(400, "User id is required");
    }

    await processFarmForUser(id);

    const user = await User.findById(id).populate("inventory.itemId").lean();

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const animals = await Animal.find({ ownerId: user._id }).lean();
    const exp = user.exp ?? 0;
    const level = levelFromExp(exp);
    const storageSlots = storageSlotsForLevel(level);

    const pendingFarmProductMints = (user.pendingFarmProductMints ?? []).map(
        (p: { _id?: unknown; species?: string; tierId?: string }) => ({
            id: String(p._id),
            species: p.species,
            tierId: p.tierId,
            label: farmProductDisplayName(p.species as SpeciesId, p.tierId as OnChainTierId),
            fcValue: ON_CHAIN_TIERS.find((t) => t.id === p.tierId)?.fc ?? 0,
        }),
    );

    type SpawnRowSortable =
        | {
              kind: "off";
              itemKey: string;
              quantity: number;
              queuedAt: string | null;
              sortTs: number;
          }
        | {
              kind: "mint";
              id: string;
              species?: string;
              tierId?: string;
              label: string;
              fcValue: number;
              sortTs: number;
          };

    const spawnRows: SpawnRowSortable[] = [];
    for (const raw of user.pendingOffChainFarmDrops ?? []) {
        const row = raw as {
            itemKey?: string;
            quantity?: number;
            queuedAt?: Date;
        };
        const itemKey = typeof row.itemKey === "string" ? row.itemKey.trim() : "";
        if (!itemKey) continue;
        const qty = typeof row.quantity === "number" && row.quantity >= 1 ? row.quantity : 1;
        const qMs = row.queuedAt ? new Date(row.queuedAt).getTime() : 0;
        spawnRows.push({
            kind: "off",
            itemKey,
            quantity: qty,
            queuedAt: row.queuedAt ? new Date(row.queuedAt).toISOString() : null,
            sortTs: qMs,
        });
    }

    const rawMintDocs = user.pendingFarmProductMints ?? [];
    for (const raw of rawMintDocs) {
        const p = raw as {
            _id?: unknown;
            species?: string;
            tierId?: string;
            createdAt?: Date;
        };
        const oid = String(p._id ?? "");
        if (!oid) continue;
        const sortTs =
            p.createdAt && !Number.isNaN(new Date(p.createdAt).getTime())
                ? new Date(p.createdAt).getTime()
                : Types.ObjectId.isValid(oid)
                  ? new Types.ObjectId(oid).getTimestamp().getTime()
                  : Date.now();
        spawnRows.push({
            kind: "mint",
            id: oid,
            species: p.species,
            tierId: p.tierId,
            label: farmProductDisplayName(p.species as SpeciesId, p.tierId as OnChainTierId),
            fcValue: ON_CHAIN_TIERS.find((t) => t.id === p.tierId)?.fc ?? 0,
            sortTs,
        });
    }

    spawnRows.sort((a, b) => a.sortTs - b.sortTs);
    const farmSpawnQueue = spawnRows.map((entry) =>
        entry.kind === "mint"
            ? {
                  kind: "mint" as const,
                  id: entry.id,
                  species: entry.species,
                  tierId: entry.tierId,
                  label: entry.label,
                  fcValue: entry.fcValue,
              }
            : {
                  kind: "off" as const,
                  itemKey: entry.itemKey,
                  quantity: entry.quantity,
                  queuedAt: entry.queuedAt,
              },
    );

    const farmDropQueueCapacity = farmSpawnDropQueueCapacityForLevel(level);

    return {
        user,
        inventory: user.inventory ?? [],
        animals,
        progression: {
            exp,
            level,
            storageSlots,
            farmDropQueueCapacity,
        },
        pendingFarmProductMints,
        farmSpawnQueue,
        fastTest: isFastTestEnabled(),
    };
};
