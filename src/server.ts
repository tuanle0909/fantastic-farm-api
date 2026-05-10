import "./loadEnv";
import app from "./app";
import { isFastTestEnabled } from "./config/fastTest";
import connectDB from "./config/db";
import { startStudioFcSwapScheduler } from "./schedulers/studioFcSwap.scheduler";

const PORT = Number(process.env.PORT ?? 8000);

if (isFastTestEnabled()) {
    console.warn(
        "[FANTASTIC_FARM_FAST_TEST] Fast playtest mode ON — short spawn ticks, faster hunger, optional free shop/hatch. Do not use in production.",
    );
}

connectDB();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  startStudioFcSwapScheduler();
});
