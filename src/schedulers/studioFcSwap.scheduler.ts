import {
    studioSwapEnabled,
    studioSwapIntervalMs,
} from "../config/studioSwap";
import { runStudioFcSwapOnce } from "../services/studioFcSwap.service";

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Runs `runStudioFcSwapOnce` on an interval (default 1h). Non-blocking; logs errors.
 */
export function startStudioFcSwapScheduler(): void {
    if (intervalId !== null) return;

    if (!studioSwapEnabled()) {
        console.log("[studio-fc-reserve] disabled — set STUDIO_FC_SWAP_ENABLED=true + FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID + studio swap key.");
        return;
    }

    const ms = studioSwapIntervalMs();
    const tick = () => {
        void runStudioFcSwapOnce().catch((e: unknown) => {
            console.error("[studio-fc-swap] tick failed", e);
        });
    };

    console.log(
        `[studio-fc-reserve] scheduler started (sell_fc_for_sui every ${Math.round(ms / 1000)}s). Set STUDIO_FC_SWAP_ENABLED=false to disable.`,
    );
    tick();
    intervalId = setInterval(tick, ms);
}
