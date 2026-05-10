import { HUNGER_DECAY_PER_HOUR, PREMIUM_FEED_DURATION_MIN, STARTER_BONUS_DAYS } from "@fantastic-farm/shared";

function truthy(v: string | undefined): boolean {
    return v === "1" || (v ?? "").toLowerCase() === "true";
}

/**
 * Read on each call so it works after `loadEnv` / `dotenv.config()` (avoid stale `false` at module init).
 * Local/QA only — never enable in production.
 * Egg NFT FC (`egg_shop::buy_egg_with_fc`) is enforced on-chain — not overridden here.
 */
export function isFastTestEnabled(): boolean {
    return truthy(process.env.FANTASTIC_FARM_FAST_TEST);
}

/**
 * Wall-clock ms between harvest ticks. Normal: GDD `spawnHours` × 1h.
 * Fast: 1 GDD hour = `FANTASTIC_FARM_TEST_SEC_PER_GDD_HOUR` real seconds (default 15 → chicken 4h ≈ 60s).
 */
export function spawnIntervalMsFromGddHours(spawnHours: number): number {
    if (!isFastTestEnabled()) return spawnHours * 3_600_000;
    const secPerGddHour = Number(process.env.FANTASTIC_FARM_TEST_SEC_PER_GDD_HOUR ?? "15");
    const mult = Number.isFinite(secPerGddHour) && secPerGddHour > 0 ? secPerGddHour : 15;
    const seconds = Math.max(3, spawnHours * mult);
    return seconds * 1000;
}

/**
 * Animals created before FAST_TEST still store `nextSpawnAt` in real wall hours.
 * If time left until spawn is much longer than two fast-test intervals, snap to one interval from now.
 */
export function clampNextSpawnAtMsForFastTest(
    nextSpawnAtMs: number,
    nowMs: number,
    spawnHours: number,
): number {
    if (!isFastTestEnabled()) return nextSpawnAtMs;
    const interval = spawnIntervalMsFromGddHours(spawnHours);
    const remaining = nextSpawnAtMs - nowMs;
    if (remaining <= interval * 2) return nextSpawnAtMs;
    return nowMs + interval;
}

export function hungerDecayPerHourEffective(): number {
    if (!isFastTestEnabled()) return HUNGER_DECAY_PER_HOUR;
    const mult = Number(process.env.FANTASTIC_FARM_TEST_HUNGER_MULT ?? "48");
    return HUNGER_DECAY_PER_HOUR * (Number.isFinite(mult) && mult > 0 ? mult : 48);
}

export function premiumFeedDurationMsEffective(): number {
    if (!isFastTestEnabled()) return PREMIUM_FEED_DURATION_MIN * 60_000;
    const min = Number(process.env.FANTASTIC_FARM_TEST_PREMIUM_MIN ?? "2");
    return Math.max(0.25, Number.isFinite(min) ? min : 2) * 60_000;
}

export function hatchGoldEffective(base: number): number {
    if (!isFastTestEnabled()) return base;
    if (truthy(process.env.FANTASTIC_FARM_TEST_FREE_HATCH)) return 0;
    return base;
}

export function shopGoldUnitEffective(unit: number): number {
    if (!isFastTestEnabled()) return unit;
    if (truthy(process.env.FANTASTIC_FARM_TEST_FREE_SHOP)) return 0;
    return unit;
}

export function starterBonusDurationMs(): number {
    if (!isFastTestEnabled()) return STARTER_BONUS_DAYS * 24 * 60 * 60 * 1000;
    const hours = Number(process.env.FANTASTIC_FARM_TEST_STARTER_BONUS_HOURS ?? "2");
    return Math.max(0.25, Number.isFinite(hours) ? hours : 2) * 3_600_000;
}
