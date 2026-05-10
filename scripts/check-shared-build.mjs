import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const candidates = [
  resolve(cwd, "node_modules", "@fantastic-farm", "shared", "dist", "index.js"),
  resolve(cwd, "..", "shared", "dist", "index.js"),
];

const sharedDistEntry = candidates.find((p) => existsSync(p));

if (!sharedDistEntry) {
  console.error("[check:shared] Missing shared build output. Expected one of:");
  for (const p of candidates) console.error("  -", p);
  console.error("[check:shared] Install deps (`npm install`) or build sibling: `cd ../shared && npm run build`");
  process.exit(1);
}

console.log("[check:shared] OK:", sharedDistEntry);
