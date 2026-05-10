/**
 * Studio wallet FC → SUI conversion for marketplace/on-chain FC fees (`farm_config::studio_fee_recipient`).
 *
 * Runs `fantastic_coin::sell_fc_for_sui` (same reserve path as the web “Rút FC → SUI” panel).
 * No DEX liquidity required — pulls SUI from `FcMintRegistry.sui_reserve` with 10% withdraw fee to studio.
 */

import {
    studioSwapExpectedSignerAddress,
    studioSwapMinFcMist,
    studioSwapPrivateKeyHex,
    studioSwapEnabled,
} from "../config/studioSwap";
import { fantasticFarmEnv } from "../config/fantasticFarmEnv";

function asVersionString(v: unknown): string | null {
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
    return null;
}

function extractInitialSharedVersionForSharedObject(owner: unknown): string | null {
    if (!owner || typeof owner !== "object") return null;
    const o = owner as Record<string, unknown>;

    if (o.$kind === "Shared" && o.Shared && typeof o.Shared === "object") {
        const s = o.Shared as Record<string, unknown>;
        return asVersionString(s.initialSharedVersion ?? s.initial_shared_version);
    }
    if (
        o.$kind === "ConsensusAddressOwner" &&
        o.ConsensusAddressOwner &&
        typeof o.ConsensusAddressOwner === "object"
    ) {
        const c = o.ConsensusAddressOwner as Record<string, unknown>;
        return asVersionString(c.startVersion ?? c.start_version);
    }
    if (o.Shared && typeof o.Shared === "object") {
        const s = o.Shared as Record<string, unknown>;
        return asVersionString(s.initial_shared_version ?? s.initialSharedVersion);
    }
    if (o.ConsensusAddressOwner && typeof o.ConsensusAddressOwner === "object") {
        const c = o.ConsensusAddressOwner as Record<string, unknown>;
        return asVersionString(c.start_version ?? c.startVersion);
    }
    return null;
}

type GetObjectClient = {
    getObject: (opts: { id: string; options: object }) => Promise<unknown>;
};

async function addFcMintRegistryMutableToTransaction(
    client: GetObjectClient,
    tx: {
        sharedObjectRef: (a: { objectId: string; initialSharedVersion: string; mutable: boolean }) => unknown;
    },
    packageId: string,
    fcMintRegistryObjectId: string,
) {
    const { normalizeSuiAddress } = await import("@mysten/sui/utils");
    const pkg = normalizeSuiAddress(packageId.trim());
    const rid = normalizeSuiAddress(fcMintRegistryObjectId.trim());
    const { data: d } = (await client.getObject({
        id: rid,
        options: { showType: true, showOwner: true },
    })) as { data?: { type?: string; owner?: unknown } };
    if (!d?.type) {
        throw new Error(`FcMintRegistry not found (${rid}). Set FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID.`);
    }
    const m = d.type.match(/^(0x[0-9a-fA-F]+)::fantastic_coin::FcMintRegistry$/);
    if (!m) {
        throw new Error(`Wrong object for FcMintRegistry. Got: ${d.type}`);
    }
    const objectPkg = normalizeSuiAddress(m[1]);
    if (objectPkg !== pkg) {
        throw new Error(
            `FcMintRegistry belongs to package ${objectPkg} but FANTASTIC_FARM_PACKAGE_ID is ${pkg}`,
        );
    }
    const initialSharedVersion = extractInitialSharedVersionForSharedObject(d.owner);
    if (!initialSharedVersion) {
        throw new Error(`FcMintRegistry ${rid}: could not parse shared owner version`);
    }
    return tx.sharedObjectRef({
        objectId: rid,
        initialSharedVersion,
        mutable: true,
    });
}

async function pickFcCoinObjects(
    client: {
        getCoins: (x: { owner: string; coinType: string; cursor?: string | null }) => Promise<{
            data: Array<{ coinObjectId: string; balance: string }>;
            hasNextPage: boolean;
            nextCursor?: string | null;
        }>;
    },
    owner: string,
    coinType: string,
    minBalance: bigint,
): Promise<{ coinObjectIds: string[]; totalBalance: bigint }> {
    const { normalizeSuiAddress } = await import("@mysten/sui/utils");
    const coinObjectIds: string[] = [];
    let totalBalance = 0n;
    let cursor: string | null | undefined = null;
    const ownerNorm = normalizeSuiAddress(owner.trim());
    for (let p = 0; p < 40; p++) {
        const page = await client.getCoins({ owner: ownerNorm, coinType, cursor });
        for (const c of page.data) {
            coinObjectIds.push(c.coinObjectId);
            totalBalance += BigInt(c.balance);
            if (totalBalance >= minBalance) return { coinObjectIds, totalBalance };
        }
        if (!page.hasNextPage) break;
        cursor = page.nextCursor ?? null;
    }
    throw new Error("Insufficient FC balance for reserve sell.");
}

async function buildSellFcForSuiTransaction(
    client: GetObjectClient,
    packageId: string,
    fcMintRegistryObjectId: string,
    senderAddress: string,
    fcAmountMist: bigint,
    coinObjectIds: string[],
    aggregatedBalance: bigint,
) {
    const { normalizeSuiAddress } = await import("@mysten/sui/utils");
    const { Transaction } = await import("@mysten/sui/transactions");
    if (fcAmountMist <= 0n) throw new Error("FC amount must be positive");
    if (coinObjectIds.length === 0) throw new Error("No FC coins");
    if (aggregatedBalance < fcAmountMist) throw new Error("FC balance below sell amount");
    const tx = new Transaction();
    const registry = await addFcMintRegistryMutableToTransaction(client, tx, packageId, fcMintRegistryObjectId);
    const primary = tx.object(coinObjectIds[0]);
    if (coinObjectIds.length > 1) {
        tx.mergeCoins(
            primary,
            coinObjectIds.slice(1).map((id) => tx.object(id)),
        );
    }
    const [sellCoin] = tx.splitCoins(primary, [fcAmountMist]);
    tx.moveCall({
        target: `${packageId.trim()}::fantastic_coin::sell_fc_for_sui`,
        arguments: [registry as never, sellCoin],
    });
    if (aggregatedBalance > fcAmountMist) {
        tx.transferObjects([primary], tx.pure.address(normalizeSuiAddress(senderAddress.trim())));
    }
    return tx;
}

async function fcCoinTypeFromPackage(packageId: string): Promise<string> {
    const { normalizeSuiAddress } = await import("@mysten/sui/utils");
    const norm = normalizeSuiAddress(packageId.trim());
    return `${norm}::fantastic_coin::FANTASTIC_COIN`;
}

async function getStudioSwapKeypair(): Promise<{ keypair: unknown; address: string }> {
    const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
    const hex = studioSwapPrivateKeyHex();
    if (!hex) {
        throw new Error("Set FANTASTIC_FARM_STUDIO_SWAP_PRIVATE_KEY_HEX (or STUDIO_SWAP_PRIVATE_KEY_HEX)");
    }
    const buf = Buffer.from(hex.replace(/^0x/i, ""), "hex");
    if (buf.length !== 32) {
        throw new Error(
            `Studio swap private key must be 32 bytes (64 hex). Got ${buf.length} bytes`,
        );
    }
    const keypair = Ed25519Keypair.fromSecretKey(buf);
    const address = keypair.getPublicKey().toSuiAddress();
    return { keypair, address };
}

function assertSignerMatchesExpected(signingAddress: string): void {
    const { normalizeSuiAddress } = require("@mysten/sui/utils") as {
        normalizeSuiAddress: (a: string) => string;
    };
    const expected = normalizeSuiAddress(studioSwapExpectedSignerAddress());
    const actual = normalizeSuiAddress(signingAddress);
    if (actual !== expected) {
        throw new Error(
            `Studio swap signer ${actual} does not match STUDIO_SWAP_SIGNER_EXPECTED_ADDRESS (${expected}). ` +
                "Use keys for wallet that equals Move `farm_config::studio_fee_recipient()`.",
        );
    }
}

async function getTotalFcBalanceMist(
    client: {
        getCoins: (x: { owner: string; coinType: string; cursor?: string | null }) => Promise<{
            data: Array<{ balance: string }>;
            hasNextPage: boolean;
            nextCursor?: string | null;
        }>;
    },
    owner: string,
    coinType: string,
): Promise<bigint> {
    let cursor: string | null | undefined = null;
    let total = 0n;
    for (let i = 0; i < 128; i++) {
        const res = await client.getCoins({ owner, coinType, cursor });
        for (const c of res.data) {
            total += BigInt(c.balance);
        }
        cursor = res.hasNextPage ? res.nextCursor ?? null : null;
        if (!cursor) break;
    }
    return total;
}

/**
 * Consolidates FC on studio wallet and converts to SUI via `sell_fc_for_sui` once per tick.
 */
export async function runStudioFcSwapOnce(): Promise<{ skipped: boolean; reason?: string; digest?: string }> {
    if (!studioSwapEnabled()) {
        return { skipped: true, reason: "STUDIO_FC_SWAP_ENABLED not true" };
    }
    if (!fantasticFarmEnv.packageId) {
        return { skipped: true, reason: "FANTASTIC_FARM_PACKAGE_ID not set" };
    }
    if (!fantasticFarmEnv.fcMintRegistryObjectId) {
        return {
            skipped: true,
            reason: "FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID not set (required for reserve FC→SUI)",
        };
    }

    const { keypair, address } = await getStudioSwapKeypair();
    assertSignerMatchesExpected(address);

    const { SuiJsonRpcClient } = await import("@mysten/sui/jsonRpc");
    const client = new SuiJsonRpcClient({
        url: fantasticFarmEnv.rpcUrl,
        network: fantasticFarmEnv.network as "testnet" | "mainnet" | "devnet" | "localnet",
    });

    const fcType = await fcCoinTypeFromPackage(fantasticFarmEnv.packageId);
    const balance = await getTotalFcBalanceMist(client, address, fcType);
    const min = studioSwapMinFcMist();
    if (balance < min) {
        return {
            skipped: true,
            reason: `FC balance ${balance} < minimum ${min}`,
        };
    }

    const { coinObjectIds, totalBalance } = await pickFcCoinObjects(client, address, fcType, balance);

    try {
        const tx = await buildSellFcForSuiTransaction(
            client,
            fantasticFarmEnv.packageId,
            fantasticFarmEnv.fcMintRegistryObjectId,
            address,
            balance,
            coinObjectIds,
            totalBalance,
        );

        const res = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair as never,
        });

        const digest =
            typeof res === "object" && res !== null && "digest" in res && typeof (res as { digest: unknown }).digest === "string"
                ? (res as { digest: string }).digest
                : undefined;
        console.log("[studio-fc-reserve-sell]", digest ?? res);
        return { skipped: false, digest };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("EWithdrawInsufficientReserve") || msg.includes("insufficient reserve")) {
            return {
                skipped: true,
                reason:
                    `Reserve insufficient for sell_fc_for_sui (${msg}). Vault backs FC from buy_fc — ` +
                    "if only marketplace FC exists, top up reserve via on-ramp or wait for mixed supply.",
            };
        }
        throw e;
    }
}
