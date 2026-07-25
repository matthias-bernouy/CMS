import { readFile } from "node:fs/promises";
import {
    IMAGE_PERFORMANCE_BROWSER_SCHEMA,
    IMAGE_PERFORMANCE_SCHEMA,
    type BrowserPerformanceArtifact,
    type ImagePerformanceArtifact,
} from "../contracts";
import { buildCurrentBrowserComponent } from "../browser/componentBuild";
import { numberArgument, parseArguments, textArgument } from "../core/args";
import { writeJsonArtifact } from "../core/output";
import { currentCodeFingerprint } from "../provenance";
import { compareArtifacts } from "./gates";

async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const baseline = await readArtifact(textArgument(args, "baseline"));
    const candidate = await readArtifact(textArgument(args, "candidate"));
    const browser = await readBrowserArtifact(textArgument(args, "browser"));
    const [currentFingerprint, currentComponentBuild] = await Promise.all([
        currentCodeFingerprint(),
        buildCurrentBrowserComponent(),
    ]);
    const comparison = compareArtifacts(baseline, candidate, browser, {
        minimumSavingsRatio: numberArgument(args, "minimum-savings", 0.8),
        foregroundRegressionRatio: numberArgument(args, "foreground-regression-ratio", 0.05),
        foregroundAllowanceMs: numberArgument(args, "foreground-allowance-ms", 10),
        coldForegroundMaximumMs: numberArgument(args, "cold-foreground-maximum-ms", 75),
        browserClsMaximum: numberArgument(args, "browser-cls-maximum", 0.001),
        browserClsRegressionAllowance: numberArgument(args, "browser-cls-regression-allowance", 0.001),
        maximumThumbnailMae: numberArgument(args, "maximum-thumbnail-mae", 0.15),
        maximumPeakRssBytes: requiredPositiveNumber(
            args,
            "maximum-peak-rss-bytes",
            "IMAGE_PERFORMANCE_MAX_PEAK_RSS_BYTES",
        ),
        maximumScenarioCpuMs: requiredPositiveNumber(
            args,
            "maximum-scenario-cpu-ms",
            "IMAGE_PERFORMANCE_MAX_SCENARIO_CPU_MS",
        ),
        approvedCorpusFingerprint: requiredHash(
            args,
            "approved-corpus-fingerprint",
            "IMAGE_PERFORMANCE_APPROVED_CORPUS_FINGERPRINT",
        ),
        currentCodeFingerprint: currentFingerprint,
        currentComponentBuild,
        nowMs: Date.now(),
        maxArtifactAgeMs: numberArgument(args, "max-artifact-age-ms", 6 * 60 * 60 * 1_000),
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

function requiredPositiveNumber(args: Map<string, string>, name: string, environmentName: string): number {
    const raw = configuredValue(args, name, environmentName);
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`--${name} or ${environmentName} must be a positive number`);
    }
    return value;
}

function requiredHash(args: Map<string, string>, name: string, environmentName: string): string {
    const value = configuredValue(args, name, environmentName);
    if (!/^[a-f0-9]{64}$/.test(value)) {
        throw new Error(`--${name} or ${environmentName} must be a lowercase SHA-256 fingerprint`);
    }
    return value;
}

function configuredValue(args: Map<string, string>, name: string, environmentName: string): string {
    const value = args.get(name)?.trim() || process.env[environmentName]?.trim();
    if (!value) {
        throw new Error(`Set --${name} or ${environmentName}`);
    }
    return value;
}

async function readArtifact(path: string): Promise<ImagePerformanceArtifact> {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ImagePerformanceArtifact>;
    if (value.schema !== IMAGE_PERFORMANCE_SCHEMA || !Array.isArray(value.listing)) {
        throw new Error("Unsupported image performance artifact");
    }
    return value as ImagePerformanceArtifact;
}

async function readBrowserArtifact(path: string): Promise<BrowserPerformanceArtifact> {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<BrowserPerformanceArtifact>;
    if (value.schema !== IMAGE_PERFORMANCE_BROWSER_SCHEMA || !Array.isArray(value.cases)) {
        throw new Error("Unsupported image performance browser artifact");
    }
    return value as BrowserPerformanceArtifact;
}

await main().catch((error: unknown) => {
    console.error(`[image-performance-compare] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
