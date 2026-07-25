import { IMAGE_PERFORMANCE_SCHEMA, type ImagePerformanceArtifact, type ListingSample } from "../../contracts";
import { summarizeListing } from "../../core/math";
import { createPerformanceProvenance } from "../../provenance";

export const TEST_CODE_FINGERPRINT = "a".repeat(64);
export const TEST_NOW_MS = 1_800_000_000_000;
export const TEST_SUITE_ID = "image-performance-test-suite";

const LADDER = [64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560];

export function comparisonThresholds() {
    return {
        minimumSavingsRatio: 0.8,
        foregroundRegressionRatio: 0.05,
        foregroundAllowanceMs: 10,
        coldForegroundMaximumMs: 75,
        browserClsMaximum: 0.001,
        browserClsRegressionAllowance: 0.001,
        maximumThumbnailMae: 0.15,
        maximumPeakRssBytes: 1_000_000_000,
        maximumScenarioCpuMs: 10_000,
        approvedCorpusFingerprint: "b".repeat(64),
        currentCodeFingerprint: TEST_CODE_FINGERPRINT,
        currentComponentBuild: {
            entryFingerprint: "c".repeat(64),
            enabledBundleFingerprint: "d".repeat(64),
            disabledBundleFingerprint: "e".repeat(64),
        },
        nowMs: TEST_NOW_MS,
        maxArtifactAgeMs: 60_000,
    };
}

export function artifact(
    label: string,
    listingImageBytesMedian: number,
    listingImageBytesP95: number,
    warmEncodes: number,
    foregroundP95Ms: number,
): ImagePerformanceArtifact {
    const role = label === "baseline" ? "baseline" : "candidate";
    const listing = listingSamples(role, listingImageBytesMedian, listingImageBytesP95, warmEncodes, foregroundP95Ms);
    const artifactWithoutProvenance: Omit<ImagePerformanceArtifact, "provenance"> = {
        schema: IMAGE_PERFORMANCE_SCHEMA,
        label,
        adapter: role === "baseline" ? "original" : "source-responsive-webp-v1-local-fs",
        implementation: {
            mode: role === "baseline" ? "original" : "source-image",
            recipeId: "source-responsive-webp-v1",
            encoderIdentity: role === "baseline" ? "original-pass-through" : "test-sharp-vips-webp",
        },
        corpus: {
            kind: "directory",
            fingerprint: "b".repeat(64),
            accepted: 12,
            rejected: 0,
            rejections: { animated: 0, invalidOrUnsafe: 0, oversizedBytes: 0 },
            assets: Array.from({ length: 12 }, (_, index) => corpusAsset(index, role)),
        },
        configuration: {
            ladder: LADDER,
            cardCount: 12,
            viewportWidth: 1_000,
            repetitions: 5,
            users: [1, 4],
            foregroundRequests: 24,
            imageUpstreamDelayMs: 15,
        },
        listing,
        summary: summarizeListing(listing),
    };
    return {
        ...artifactWithoutProvenance,
        provenance: createPerformanceProvenance({
            artifact: artifactWithoutProvenance,
            suiteId: TEST_SUITE_ID,
            codeFingerprint: TEST_CODE_FINGERPRINT,
            generatedAtMs: TEST_NOW_MS - 1_000,
            runtimeVersion: "1.3.14-test",
        }),
    };
}

function corpusAsset(index: number, role: "baseline" | "candidate") {
    return {
        assetId: `asset-${String(index + 1).padStart(4, "0")}`,
        mediaType: "image/png",
        sourceBytes: 1_000,
        sourceWidth: 384,
        sourceHeight: 256,
        passthrough: {
            status: 200,
            actualWidth: 384,
            actualHeight: 256,
            outputBytes: 1_000,
            matchesSourceBytes: true,
            outputMediaType: "image/png",
            outputFormat: "png",
            normalizedThumbnailMae: 0,
            durationMs: 1,
        },
        variants: [64, 128, 256, 384].map((targetWidth) => ({
            targetWidth,
            status: 200,
            actualWidth: role === "baseline" ? 384 : targetWidth,
            actualHeight: role === "baseline" ? 256 : Math.round((targetWidth * 2) / 3),
            outputBytes: role === "baseline" ? 1_000 : 100,
            matchesSourceBytes: role === "baseline",
            outputMediaType: role === "baseline" ? "image/png" : "image/webp",
            outputFormat: role === "baseline" ? "png" : "webp",
            normalizedThumbnailMae: role === "baseline" ? 0 : 0.02,
            durationMs: 1,
        })),
    };
}

function listingSamples(
    role: "baseline" | "candidate",
    medianBytes: number,
    p95Bytes: number,
    warmEncodes: number,
    foregroundP95Ms: number,
): ListingSample[] {
    const samples: ListingSample[] = [];
    for (const layout of ["narrow", "wide"] as const) {
        for (const dpr of [1, 2]) {
            for (const users of [1, 4]) {
                for (let repetition = 1; repetition <= 5; repetition++) {
                    for (const phase of ["cold", "warm"] as const) {
                        samples.push(listingSample(role, phase, layout, dpr, users, repetition, foregroundP95Ms));
                    }
                }
            }
        }
    }
    samples.forEach((sample, index) => {
        sample.imageBytes = index >= samples.length - 5 ? p95Bytes : medianBytes;
    });
    const firstWarm = samples.find(({ phase }) => phase === "warm")!;
    firstWarm.stats.encodes = warmEncodes;
    return samples;
}

function listingSample(
    role: "baseline" | "candidate",
    phase: "cold" | "warm",
    layout: "narrow" | "wide",
    dpr: number,
    users: number,
    repetition: number,
    foregroundP95Ms: number,
): ListingSample {
    const candidateCold = role === "candidate" && phase === "cold";
    return {
        phase,
        layout,
        dpr,
        users,
        repetition,
        imageBytes: 0,
        failedImages: 0,
        firstImageMs: 1,
        allImagesMs: 2,
        foregroundP50Ms: foregroundP95Ms,
        foregroundP95Ms,
        foregroundP99Ms: foregroundP95Ms,
        foregroundSamples: 24,
        elapsedMs: 3,
        cpuMs: 2,
        peakRssBytes: 1,
        stats: {
            cacheHits: role === "candidate" && phase === "warm" ? users * 12 : 0,
            encodes: candidateCold ? 12 : 0,
            upstreamReads: candidateCold ? 12 : role === "baseline" ? users * 12 : 0,
        },
    };
}
