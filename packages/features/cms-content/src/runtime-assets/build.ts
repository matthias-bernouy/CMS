import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT_DIRECTORY = join(import.meta.dir, "generated");
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
            conditions: ["bun"],
        });
        if (!result.success || !result.outputs[0]) {
            throw new AggregateError(result.logs, `Failed to build ${entry.output}`);
        }
        await Bun.write(join(outputDirectory, entry.output), result.outputs[0]);
    }
}

if (import.meta.main) {
    await buildContentBrowserAssets();
}
