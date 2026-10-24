import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { assertBrowserBuildGraph, assertBrowserBundleSize } from "./browserBuildPolicy";

const OUTPUT_DIRECTORY = join(import.meta.dir, "../../dist/runtime-assets");
const ENTRIES = [
    { source: "../browser/entries/blocRuntime.entry.ts", output: "bloc-runtime.js" },
    { source: "../browser/entries/bindingCore.entry.ts", output: "binding-core.js" },
] as const;

export async function buildContentBrowserAssets(outputDirectory = OUTPUT_DIRECTORY): Promise<void> {
    await mkdir(outputDirectory, { recursive: true });
    for (const entry of ENTRIES) {
        const result = await Bun.build({
            entrypoints: [join(import.meta.dir, entry.source)],
            format: "iife",
            minify: true,
            target: "browser",
            metafile: true,
        });
        if (!result.success || !result.outputs[0]) {
            throw new AggregateError(result.logs, `Failed to build ${entry.output}`);
        }
        if (!result.metafile) {
            throw new Error(`Build metadata is missing for ${entry.output}`);
        }
        assertBrowserBuildGraph(entry.output, result.metafile);
        const bytes = new Uint8Array(await result.outputs[0].arrayBuffer());
        assertBrowserBundleSize(entry.output, bytes);
        await Bun.write(join(outputDirectory, entry.output), bytes);
    }
}

if (import.meta.main) {
    await buildContentBrowserAssets();
}
