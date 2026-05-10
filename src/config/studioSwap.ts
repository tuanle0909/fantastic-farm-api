/**
 * Automated FC → SUI for studio fee FC via `fantastic_coin::sell_fc_for_sui` (reserve; no DEX).
 *
 * Set `STUDIO_SWAP_SIGNER_EXPECTED_ADDRESS` + private key for the wallet that equals
 * `farm_config::studio_fee_recipient`. Requires `FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID`.
 */
export function studioSwapEnabled(): boolean {
    return process.env.STUDIO_FC_SWAP_ENABLED?.trim().toLowerCase() === "true";
}

/** Default 60 minutes. */
export function studioSwapIntervalMs(): number {
    const raw = Number(process.env.STUDIO_FC_SWAP_INTERVAL_MS ?? 3_600_000);
    return Number.isFinite(raw) && raw >= 60_000 ? raw : 3_600_000;
}

/** Minimum FC (mist/9dp) balance before triggering a swap. Default 1 FC. */
export function studioSwapMinFcMist(): bigint {
    const raw = process.env.STUDIO_FC_SWAP_MIN_AMOUNT_MIST?.trim() ?? "1000000000";
    try {
        return BigInt(raw);
    } catch {
        return 1_000_000_000n;
    }
}

/** Legacy no-op hook (formerly DEX slippage). Reserved if a router path returns. */
export function studioSwapSlippageBps(): number {
    const n = Number(process.env.STUDIO_FC_SWAP_SLIPPAGE_BPS ?? 150);
    return Number.isFinite(n) && n >= 1 && n <= 2000 ? n : 150;
}

/**
 * Expected Sui address of the studio swap signer (must hold FC fee coins + SUI for gas).
 */
export function studioSwapExpectedSignerAddress(): string {
    const fromEnv =
        process.env.STUDIO_SWAP_SIGNER_EXPECTED_ADDRESS?.trim() ||
        process.env.STUDIO_SWAP_WALLET_EXPECTED_ADDRESS?.trim();
    /** Default matches `farm_config::studio_fee_recipient()` (publisher/studio fee wallet). */
    return (
        fromEnv ||
        "0x049e76351fec8e6fcf2d9f39e23858629a1d3de7bb67a72e998f91198184b2c1"
    );
}

/** Primary env name for swap bot private key (32-byte hex seed like mint signer). */
export function studioSwapPrivateKeyHex(): string {
    const v =
        process.env.FANTASTIC_FARM_STUDIO_SWAP_PRIVATE_KEY_HEX?.trim() ||
        process.env.STUDIO_SWAP_PRIVATE_KEY_HEX?.trim();
    return v ?? "";
}

/** Unused for reserve sells; kept for backwards-compatible env scanning. */
export function studioSwapAllowNonMainnet(): boolean {
    return process.env.STUDIO_FC_SWAP_ALLOW_NON_MAINNET?.trim().toLowerCase() === "true";
}
