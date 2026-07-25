import { readFile } from "node:fs/promises";
import { buildCurrentBrowserComponent } from "../browser/componentBuild";
import {
    IMAGE_PERFORMANCE_BROWSER_SCHEMA,
    IMAGE_PERFORMANCE_SCHEMA,
    type BrowserPerformanceArtifact,
    type GateResult,
    type ImagePerformanceArtifact,
} from "../contracts";
import { numberArgument, parseArguments, textArgument } from "../core/args";
import { writeJsonArtifact } from "../core/output";
import { currentCodeFingerprint } from "../provenance";
import { candidateArtifactIntegrityGates } from "./artifactGates";
import { browserPerformanceGates } from "./browserGates";
import { assertSmokeCandidateArtifact } from "./performanceValidation";
import { assertCandidateBrowserProvenance, type ProvenanceExpectations } from "./provenanceValidation";

type SmokeValidationOptions = ProvenanceExpectations & {
    browserClsMaximum: number;
    browserClsRegressionAllowance: number;
    maximumThumbnailMae: number;
};

export function validateSmokeArtifacts(
    candidate: ImagePerformanceArtifact,
    browser: BrowserPerformanceArtifact,
    options: SmokeValidationOptions,
): GateResult[] {
    assertSmokeCandidateArtifact(candidate);
    assertCandidateBrowserProvenance(candidate, browser, options);
    return [
        exactGate("smoke_failed_images", candidate.summary.failedImages, 0),
        exactGate("smoke_warm_encodes", candidate.summary.warmEncodes, 0),
        exactGate("smoke_warm_upstream_reads", candidate.summary.warmUpstreamReads, 0),
        ...candidateArtifactIntegrityGates(candidate, options.maximumThumbnailMae),
        ...browserPerformanceGates(browser, candidate, options),
    ];
}

async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const candidate = await readCandidate(textArgument(args, "candidate"));
    const browser = await readBrowser(textArgument(args, "browser"));
    const [codeFingerprint, currentComponentBuild] = await Promise.all([
        currentCodeFingerprint(),
        buildCurrentBrowserComponent(),
    ]);
    const generatedAtMs = Date.now();
    const gates = validateSmokeArtifacts(candidate, browser, {
        currentCodeFingerprint: codeFingerprint,
        currentComponentBuild,
        nowMs: generatedAtMs,
        maxArtifactAgeMs: numberArgument(args, "max-artifact-age-ms", 60 * 60 * 1_000),
        browserClsMaximum: numberArgument(args, "browser-cls-maximum", 0.001),
        browserClsRegressionAllowance: numberArgument(args, "browser-cls-regression-allowance", 0.001),
        maximumThumbnailMae: numberArgument(args, "maximum-thumbnail-mae", 0.15),
    });
    const result = {
        schema: "cms.image-performance.smoke.v1",
        generatedAtMs,
        passed: gates.every(({ passed }) => passed),
        gates,
    };
    const output = args.get("output")?.trim();
    if (output) {
        await writeJsonArtifact(output, result);
    }
    console.info(JSON.stringify(result, null, 2));
    if (!result.passed) {
        process.exitCode = 1;
    }
}

async function readCandidate(path: string): Promise<ImagePerformanceArtifact> {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ImagePerformanceArtifact>;
    if (value.schema !== IMAGE_PERFORMANCE_SCHEMA || !Array.isArray(value.listing)) {
        throw new Error("Unsupported image performance smoke candidate");
    }
    return value as ImagePerformanceArtifact;
}

async function readBrowser(path: string): Promise<BrowserPerformanceArtifact> {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<BrowserPerformanceArtifact>;
    if (value.schema !== IMAGE_PERFORMANCE_BROWSER_SCHEMA || !Array.isArray(value.cases)) {
        throw new Error("Unsupported image performance smoke browser artifact");
    }
    return value as BrowserPerformanceArtifact;
}

function exactGate(id: string, actual: number, expected: number): GateResult {
    return { id, passed: actual === expected, actual, expected };
}

if (import.meta.main) {
    await main().catch((error: unknown) => {
        console.error(`[image-performance-smoke] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
