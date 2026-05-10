import { existsSync } from "node:fs";
import { resolve } from "node:path";

const sharedDistEntry = resolve(process.cwd(), "..", "shared", "dist", "index.js");

if (!existsSync(sharedDistEntry)) {
  console.error("[check:shared] Missing ../shared/dist/index.js");
  console.error("[check:shared] Build shared first: `cd ../shared && npm install && npm run build`");
  process.exit(1);
}

console.log("[check:shared] OK:", sharedDistEntry);
