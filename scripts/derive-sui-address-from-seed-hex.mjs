/**
 * Derive Sui address — and the 64-char hex for BE — from what you export from Sui Wallet.
 *
 * **Why `generate:studio-key` never matches your studio wallet:** it creates a NEW random keypair.
 * **To align everything to ví studio (0x049e…):** export the private key FROM that account in Sui Wallet,
 * then run this script with that export (raw hex OR `suiprivkey1…` Bech32).
 *
 * Usage (PowerShell — wrap secret in quotes if needed):
 *   node scripts/derive-sui-address-from-seed-hex.mjs "<export>" [expected-address-0x...]
 *
 * Examples:
 *   node scripts/derive-sui-address-from-seed-hex.mjs "suiprivkey1qrw4lfn..." 0x049e76351...
 *   node scripts/derive-sui-address-from-seed-hex.mjs "abc123...64hex..." 0x049e76351...
 *
 * Exit: 0 MATCH or no expected; 2 = expected given but mismatch.
 */
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const secretInput = process.argv[2]?.trim() ?? "";
const expectedRaw = process.argv[3]?.trim() ?? "";

if (!secretInput) {
    console.error('Usage: node scripts/derive-sui-address-from-seed-hex.mjs "<wallet-export-hex-or-suiprivkey>" [0xstudio...]');
    process.exit(1);
}

let kp;
/** 64-char lowercase hex for BE .env */
let hex64;

if (/^suiprivkey/i.test(secretInput)) {
    const decoded = decodeSuiPrivateKey(secretInput);
    hex64 = Buffer.from(decoded.secretKey).toString("hex");
    kp = Ed25519Keypair.fromSecretKey(decoded.secretKey);
} else {
    const hex = secretInput.replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        console.error("Expected:\n  - suiprivkey1… Bech32 from Sui Wallet export, OR\n  - exactly 64 hex chars (32-byte seed).\n");
        console.error(
            "`npm run generate:studio-key` creates a NEW wallet — it will not match ví studio unless you paste that ví's export here.",
        );
        process.exit(1);
    }
    hex64 = hex.toLowerCase();
    kp = Ed25519Keypair.fromSecretKey(Buffer.from(hex64, "hex"));
}

const addr = kp.getPublicKey().toSuiAddress();

console.log(`\nPaste into BE .env (do not commit real keys to git):`);
console.log(`FANTASTIC_FARM_STUDIO_SWAP_PRIVATE_KEY_HEX=${hex64}`);
console.log(`STUDIO_SWAP_SIGNER_EXPECTED_ADDRESS=${addr}\n`);

if (expectedRaw) {
    try {
        const want = normalizeSuiAddress(expectedRaw);
        const got = normalizeSuiAddress(addr);
        const ok = got === want;
        console.log(ok ? `MATCH — matches studio_fee_recipient ${want}` : `NO MATCH — expected ${want}, export derives ${got}`);
        console.log(ok ? `\n✓ Same ví — use hex above in .env và giữ Move farm_config::studio_fee_recipient = ${want}.` : "");
        process.exit(ok ? 0 : 2);
    } catch {
        console.error("Invalid expected address.");
        process.exit(1);
    }
} else {
    console.log("Pass studio address as 2nd arg to verify, e.g.:");
    console.log('  node scripts/derive-sui-address-from-seed-hex.mjs "<export>" 0x049e76351fec8e6fcf2d9f39e23858629a1d3de7bb67a72e998f91198184b2c1');
    process.exit(0);
}
