import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519" with {
  "resolution-mode": "import",
};

let cachedMintSigner: Ed25519Keypair | null = null;

async function loadEd25519KeypairModule() {
  return import("@mysten/sui/keypairs/ed25519");
}

/**
 * BE signing key for `MintProofProductV1` (must match Move `farm_config::server_public_key`).
 * Env: `FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX` — 64 hex chars (32-byte ed25519 seed), optional `0x` prefix.
 *
 * Uses dynamic `import()` so the rest of the app can stay CommonJS; `@mysten/sui` is ESM-only.
 */
export async function getMintSignerKeypair(): Promise<Ed25519Keypair> {
  if (cachedMintSigner) return cachedMintSigner;

  const raw = process.env.FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX?.trim();
  if (!raw) {
    throw new Error(
      "Missing FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX in .env (see .env.example)",
    );
  }

  const hex = raw.replace(/^0x/i, "");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX must decode to 32 bytes (64 hex chars); got ${buf.length} bytes`,
    );
  }

  const { Ed25519Keypair } = await loadEd25519KeypairModule();
  cachedMintSigner = Ed25519Keypair.fromSecretKey(buf);
  return cachedMintSigner;
}

/** 64 hex chars (no 0x) — paste into Move `SERVER_ED25519_PUBLIC_KEY` if you rotate the seed. */
export async function getMintSignerPublicKeyHex(): Promise<string> {
  const kp = await getMintSignerKeypair();
  return Buffer.from(kp.getPublicKey().toRawBytes()).toString("hex");
}

export const fantasticFarmEnv = {
    network: process.env.SUI_NETWORK?.trim() || "testnet",
    rpcUrl:
        process.env.SUI_RPC_URL?.trim() || "https://fullnode.testnet.sui.io:443",
    packageId: process.env.FANTASTIC_FARM_PACKAGE_ID?.trim() || "",
    registryObjectId: process.env.FANTASTIC_FARM_REGISTRY_OBJECT_ID?.trim() || "",
    /** Shared `FcMintRegistry` — required for BE studio FC→reserve SUI job. */
    fcMintRegistryObjectId: process.env.FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID?.trim() || "",
};
