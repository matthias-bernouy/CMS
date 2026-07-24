import { readFile } from "node:fs/promises";
import { IMAGE_PERFORMANCE_SCHEMA, type ImagePerformanceArtifact } from "../contracts";
import { numberArgument, parseArguments, textArgument } from "../core/args";
import { writeJsonArtifact } from "../core/output";
import { compareArtifacts } from "./gates";

async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const baseline = await readArtifact(textArgument(args, "baseline"));
    const candidate = await readArtifact(textArgument(args, "candidate"));
    const comparison = compareArtifacts(baseline, candidate, {
        minimumSavingsRatio: numberArgument(args, "minimum-savings", 0.8),
        foregroundRegressionRatio: numberArgument(args, "foreground-regression-ratio", 0.05),
        foregroundAllowanceMs: numberArgument(args, "foreground-allowance-ms", 10),
        coldForegroundMaximumMs: numberArgument(args, "cold-foreground-maximum-ms", 75),
    });
    const output = args.get("output")?.trim();
    if (output) {
        await writeJsonArtifact(output, comparison);
    }
    console.info(JSON.stringify(comparison, null, 2));
    if (!comparison.passed) {
        process.exitCode = 1;
    }
}

async function readArtifact(path: string): Promise<ImagePerformanceArtifact> {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ImagePerformanceArtifact>;
    if (value.schema !== IMAGE_PERFORMANCE_SCHEMA || !Array.isArray(value.listing)) {
        throw new Error("Unsupported image performance artifact");
    }
    return value as ImagePerformanceArtifact;
}

await main().catch((error: unknown) => {
    console.error(`[image-performance-compare] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
