import nacl from "tweetnacl";
import { fantasticFarmEnv } from "../config/fantasticFarmEnv";
import { ApiError } from "../utils/apiError";

const DOMAIN_PRODUCT = "FANTASTIC_FARM:MINT_PRODUCT:v1";
const PROOF_TTL_MS = 5 * 60 * 1000;

function requireOnchainConfig() {
    const packageId = fantasticFarmEnv.packageId;
    const registryObjectId = fantasticFarmEnv.registryObjectId;
    if (!packageId || !registryObjectId) {
        throw new ApiError(
            503,
            "On-chain not configured: set FANTASTIC_FARM_PACKAGE_ID and FANTASTIC_FARM_REGISTRY_OBJECT_ID",
        );
    }
    return { packageId, registryObjectId };
}

function toBigintU64(parsed: unknown): bigint {
    if (typeof parsed === "bigint") {
        return parsed;
    }
    if (typeof parsed === "number") {
        return BigInt(parsed);
    }
    return BigInt(String(parsed));
}

async function readNonceFromChain(recipient: string): Promise<bigint> {
    const { SuiJsonRpcClient } = await import("@mysten/sui/jsonRpc");
    const { Transaction } = await import("@mysten/sui/transactions");
    const { bcs } = await import("@mysten/sui/bcs");
    const { normalizeSuiAddress } = await import("@mysten/sui/utils");

    const { packageId, registryObjectId } = requireOnchainConfig();
    const addr = normalizeSuiAddress(recipient);
    const client = new SuiJsonRpcClient({
        url: fantasticFarmEnv.rpcUrl,
        network: fantasticFarmEnv.network as "testnet" | "mainnet" | "devnet" | "localnet",
    });

    const tx = new Transaction();
    tx.moveCall({
        target: `${packageId}::farm_registry::read_nonce`,
        arguments: [tx.object(registryObjectId), tx.pure.address(addr)],
    });

    let inspect;
    try {
        inspect = await client.devInspectTransactionBlock({
            transactionBlock: tx,
            sender: addr,
        });
    } catch {
        throw new ApiError(502, "RPC devInspect failed — check package/registry IDs and network");
    }

    const ret = inspect.results?.[0]?.returnValues?.[0];
    if (!ret) {
        return 0n;
    }
    const raw = ret[0];
    const data = new Uint8Array(raw instanceof Uint8Array ? raw : Uint8Array.from(raw as Iterable<number>));
    return toBigintU64(bcs.u64().parse(data));
}

function signProofDetached(proofBytes: Uint8Array): Uint8Array {
    const raw = process.env.FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX?.trim();
    if (!raw) {
        throw new ApiError(503, "Missing FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX");
    }
    const hex = raw.replace(/^0x/i, "");
    const seed = Buffer.from(hex, "hex");
    if (seed.length !== 32) {
        throw new ApiError(500, "Mint signing key must be 32 bytes (64 hex chars)");
    }
    const keyPair = nacl.sign.keyPair.fromSeed(seed);
    return nacl.sign.detached(proofBytes, keyPair.secretKey);
}

export type FarmProductMintProofResponse = {
    packageId: string;
    registryObjectId: string;
    proofBcsBase64: string;
    signatureBase64: string;
    nonce: string;
    expiresAtMs: string;
    speciesCode: number;
    tierCode: number;
};

/**
 * MintProofProductV1 BCS + ed25519. One proof = one `FarmProductNft` (species_code 0–3, tier 0–4). Nonce in `FarmRegistry`.
 */
export async function buildFarmProductMintProof(
    recipientWallet: string,
    speciesCode: number,
    tierCode: number,
): Promise<FarmProductMintProofResponse> {
    requireOnchainConfig();
    if (speciesCode < 0 || speciesCode > 3 || tierCode < 0 || tierCode > 4) {
        throw new ApiError(400, "Invalid species or tier for product mint");
    }

    const { bcs } = await import("@mysten/sui/bcs");
    const { normalizeSuiAddress } = await import("@mysten/sui/utils");
    const recipient = normalizeSuiAddress(recipientWallet);
    const nonce = await readNonceFromChain(recipient);
    const expiresAtMs = BigInt(Date.now() + PROOF_TTL_MS);

    const MintProofProductV1 = bcs.struct("MintProofProductV1", {
        domain: bcs.vector(bcs.u8()),
        recipient: bcs.Address,
        nonce: bcs.u64(),
        expires_at_ms: bcs.u64(),
        species_code: bcs.u8(),
        tier: bcs.u8(),
    });

    const domainBytes = new TextEncoder().encode(DOMAIN_PRODUCT);
    const proofBytes = MintProofProductV1.serialize({
        domain: Array.from(domainBytes),
        recipient,
        nonce,
        expires_at_ms: expiresAtMs,
        species_code: speciesCode,
        tier: tierCode,
    }).toBytes();

    const signature = signProofDetached(proofBytes);
    const { packageId, registryObjectId } = requireOnchainConfig();

    return {
        packageId,
        registryObjectId,
        proofBcsBase64: Buffer.from(proofBytes).toString("base64"),
        signatureBase64: Buffer.from(signature).toString("base64"),
        nonce: nonce.toString(),
        expiresAtMs: expiresAtMs.toString(),
        speciesCode,
        tierCode,
    };
}
