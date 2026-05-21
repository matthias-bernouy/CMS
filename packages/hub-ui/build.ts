// Bundles the hub-ui custom elements (src/components/*) into a single IIFE
// served at /admin/assets/hub-components.js — same approach as the CMS's
// `prebuildControl`. Run: `bun run build` (also wired into the dev stack).

import { rmSync, existsSync } from "node:fs";

const OUT_DIR    = "src/assets/";
const OUT_NAME   = "hub-components.js";
const OUT_FILE   = OUT_DIR + OUT_NAME;
const ENTRYPOINT = "src/components/index.ts";

if (existsSync(OUT_FILE)) rmSync(OUT_FILE);

const result = await Bun.build({
    entrypoints: [ENTRYPOINT],
    outdir:      OUT_DIR,
    naming:      OUT_NAME,
    format:      "iife",
    target:      "browser",
    minify:      true,
});

if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("hub-ui build: Bun.build failed");
}

console.log(`Built ${ENTRYPOINT} → ${OUT_FILE}`);
