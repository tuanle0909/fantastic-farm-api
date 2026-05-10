/**
 * Generate a NEW random Ed25519 keypair (64-char hex seed for BE `FANTASTIC_FARM_STUDIO_SWAP_PRIVATE_KEY_HEX`).
 *
 * Terminal (from repo root):
 *   cd BE
 *   npm run generate:studio-key
 * Or: node scripts/generate-ed25519-studio-key.mjs
 *
 * ⚠️ This creates a NEW address. If Move `farm_config::studio_fee_recipient` is already set to ví sẵn (e.g. 0x049e…),
 *    do NOT use this — export that wallet's private seed in Sui Wallet and pipe into `derive-sui-address-from-seed-hex.mjs`.
 * Do not commit printed secrets.
 */
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const kp = Ed25519Keypair.generate();
const bech32Secret = kp.getSecretKey();
const { secretKey } = decodeSuiPrivateKey(bech32Secret);
const hex64 = Buffer.from(secretKey).toString("hex");
const address = kp.getPublicKey().toSuiAddress();
const pubBytes = kp.getPublicKey().toRawBytes();

console.log(`
--- New studio / swap key (KEEP SECRET; do not commit) ---

STUDIO_SWAP_SIGNER_EXPECTED_ADDRESS=${address}

FANTASTIC_FARM_STUDIO_SWAP_PRIVATE_KEY_HEX=${hex64}

# If this key also signs mint proofs, mirror:
# FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX=${hex64}

Mint signer public key (32 bytes hex) for Move farm_config::server_public_key — update Move then republish:
server_public_key hex: ${Buffer.from(pubBytes).toString("hex")}

(Sui Bech32 private key backup — some wallets prefer this instead of raw hex — also valid for fromSecretKey:)
${bech32Secret}
`);
