/**
 * Standalone build script for the BasicStorageProvider components bundle.
 * The runtime path inside `StorageProvider` calls `Bun.build` directly with
 * the same config — this script is here for offline / production pipelines
 * that prefer a pre-built artifact in `dist/`.
 *
 * Run with: `bun run <path-to-this-file>`
 */
import { join } from "node:path";

const root = import.meta.dir;

const result = await Bun.build({
    entrypoints: [join(root, "index.ts")],
    outdir:       join(root, "dist"),
    target:       "browser",
    minify:        true,
    naming:       "components.[ext]",
});

if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
}

console.log(`✓ Components built (${result.outputs.length} file(s)) → ${join(root, "dist")}/components.js`);
