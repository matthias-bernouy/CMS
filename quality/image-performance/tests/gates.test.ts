import { describe, expect, test } from "bun:test";
import type { ImagePerformanceArtifact, ListingSample } from "../contracts";
import { compareArtifacts } from "../compare/gates";

describe("image performance gates", () => {
    test("accepts byte savings and bounded aggregate foreground p95", () => {
        const comparison = compareArtifacts(artifact("baseline", 1_000, 1_000, 0, 10), artifact("candidate", 200, 150, 0, 20), thresholds());

        expect(comparison.passed).toBe(true);
        expect(comparison.gates.every(({ passed }) => passed)).toBe(true);
    });

    test("rejects a warm encode even when byte savings pass", () => {
        const comparison = compareArtifacts(artifact("baseline", 1_000, 1_000, 0, 10), artifact("candidate", 100, 100, 1, 10), thresholds());

        expect(comparison.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "warm_encodes")?.passed).toBe(false);
    });

    test("rejects false descriptors and excess cold encodes", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.corpus.assets[0]!.variants[0]!.actualWidth = 128;
        candidate.listing[0]!.stats.encodes = 2;

        const comparison = compareArtifacts(baseline, candidate, thresholds());

        expect(comparison.gates.find(({ id }) => id === "descriptor_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "single_flight_excess_encodes")?.passed).toBe(false);
    });

    test("gates aggregate and absolute cold foreground p95", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const regressed = artifact("candidate", 100, 100, 0, 21);
        const coldSpike = artifact("candidate", 100, 100, 0, 10);
        coldSpike.listing.find(({ phase }) => phase === "cold")!.foregroundP95Ms = 76;

        expect(compareArtifacts(baseline, regressed, thresholds()).gates.find(({ id }) => id === "foreground_p95")?.passed).toBe(false);
        expect(compareArtifacts(baseline, coldSpike, thresholds()).gates.find(({ id }) => id === "cold_foreground_p95_absolute")?.passed).toBe(false);
    });

    test("requires identical corpus and benchmark configuration", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.corpus.fingerprint = "different";

        expect(() => compareArtifacts(baseline, candidate, thresholds())).toThrow("fingerprints differ");
    });
});

function thresholds() {
    return {
        minimumSavingsRatio: 0.8,
        foregroundRegressionRatio: 0.05,
        foregroundAllowanceMs: 10,
        coldForegroundMaximumMs: 75,
    };
}

function artifact(
    label: string,
    listingImageBytesMedian: number,
    listingImageBytesP95: number,
    warmEncodes: number,
    foregroundP95Ms: number,
): ImagePerformanceArtifact {
    const listing = [listingSample("cold", foregroundP95Ms, 0), listingSample("warm", foregroundP95Ms, warmEncodes)];
    return {
        schema: "cms.image-performance.v1",
        label,
        adapter: label === "baseline" ? "original" : label,
        corpus: {
            fingerprint: "same-corpus",
            accepted: 1,
            rejected: 0,
            assets: [{
                assetId: "asset-0001",
                mediaType: "image/png",
                sourceBytes: 1_000,
                sourceWidth: 384,
                sourceHeight: 256,
                variants: [{
                    targetWidth: 384,
                    actualWidth: 384,
                    actualHeight: 256,
                    outputBytes: label === "baseline" ? 1_000 : 100,
                    durationMs: 1,
                }],
            }],
        },
        configuration: {
            ladder: [384, 768],
            cardCount: 1,
            viewportWidth: 1_000,
            repetitions: 1,
            users: [1],
            foregroundRequests: 4,
        },
        listing,
        summary: {
            listingImageBytesMedian,
            listingImageBytesP95,
            foregroundP50Ms: foregroundP95Ms,
            foregroundP95Ms,
            foregroundP99Ms: foregroundP95Ms,
            warmEncodes,
            warmUpstreamReads: 0,
            failedImages: 0,
        },
    };
}

function listingSample(phase: "cold" | "warm", foregroundP95Ms: number, encodes: number): ListingSample {
    return {
        phase,
        layout: "narrow",
        dpr: 1,
        users: 1,
        repetition: 1,
        imageBytes: 100,
        failedImages: 0,
        firstImageMs: 1,
        allImagesMs: 2,
        foregroundP50Ms: foregroundP95Ms,
        foregroundP95Ms,
        foregroundP99Ms: foregroundP95Ms,
        elapsedMs: 3,
        cpuMs: 2,
        peakRssBytes: 1,
        stats: { cacheHits: 0, encodes, upstreamReads: 0 },
    };
}
