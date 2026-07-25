import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
    IMAGE_PERFORMANCE_SCHEMA,
    IMAGE_PERFORMANCE_PROVENANCE_SCHEMA,
    type BrowserPerformanceProvenance,
    type ImagePerformanceArtifact,
} from "../contracts";
import { parseArguments, textArgument } from "../core/args";
import { safeLabel, writeJsonArtifact } from "../core/output";
import { currentCodeFingerprint, performanceEvidenceFingerprint } from "../provenance";
import { runBrowserCase } from "./case/run";
import { buildBrowserPerformanceArtifact } from "./evidence";
import { startBrowserFixtureServer } from "./server";

async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const candidate = await readCandidate(textArgument(args, "candidate"));
    const suiteId = safeLabel(textArgument(args, "suite-id"));
    if (candidate.provenance.suiteId !== suiteId) {
        throw new Error("Browser suite id does not match the candidate artifact");
    }
    const codeFingerprint = await currentCodeFingerprint();
    if (candidate.provenance.codeFingerprint !== codeFingerprint) {
        throw new Error("Candidate artifact is stale relative to the current browser workspace");
    }
    const server = await startBrowserFixtureServer();
    const browser = await chromium.launch({ headless: true });
    try {
        const cases = [];
        for (const dpr of [1, 2]) {
            for (const loading of ["lazy", "eager"] as const) {
                cases.push(await runBrowserCase(browser, server, "baseline", loading, dpr));
                cases.push(await runBrowserCase(browser, server, "candidate", loading, dpr));
            }
        }
        if ((await currentCodeFingerprint()) !== codeFingerprint) {
            throw new Error("Image performance code changed while Chromium was running");
        }
        const provenance: BrowserPerformanceProvenance = {
            schema: IMAGE_PERFORMANCE_PROVENANCE_SCHEMA,
            suiteId,
            generatedAtMs: Date.now(),
            codeFingerprint,
            suiteFingerprint: candidate.provenance.suiteFingerprint,
            candidateEvidenceFingerprint: performanceEvidenceFingerprint(candidate),
            engine: {
                name: "chromium",
                version: browser.version(),
            },
            component: {
                productionEntry: true,
                ...server.build,
            },
            adapter: server.adapter,
        };
        const result = buildBrowserPerformanceArtifact(cases, provenance);
        const output = args.get("output")?.trim();
        if (output) {
            await writeJsonArtifact(output, result);
        }
        console.info(JSON.stringify(result, null, 2));
        if (!result.passed) {
            process.exitCode = 1;
        }
    } finally {
        await browser.close();
        await server.stop();
    }
}

async function readCandidate(path: string): Promise<ImagePerformanceArtifact> {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<ImagePerformanceArtifact>;
    if (value.schema !== IMAGE_PERFORMANCE_SCHEMA || value.provenance?.schema !== IMAGE_PERFORMANCE_PROVENANCE_SCHEMA) {
        throw new Error("Unsupported candidate artifact for browser evidence");
    }
    return value as ImagePerformanceArtifact;
}

await main().catch((error: unknown) => {
    console.error(`[image-performance-browser] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
