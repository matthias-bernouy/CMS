import type { GateResult, ImagePerformanceArtifact, ImagePerformanceComparison, ListingSample } from "../contracts";
import { percentile, rounded } from "../core/math";

export type ComparisonThresholds = {
    minimumSavingsRatio: number;
    foregroundRegressionRatio: number;
    foregroundAllowanceMs: number;
    coldForegroundMaximumMs?: number;
};

export function compareArtifacts(
    baseline: ImagePerformanceArtifact,
    candidate: ImagePerformanceArtifact,
    thresholds: ComparisonThresholds,
): ImagePerformanceComparison {
    assertComparable(baseline, candidate);
    const gates = [
        savingsGate(
            "listing_bytes_median",
            baseline.summary.listingImageBytesMedian,
            candidate.summary.listingImageBytesMedian,
            thresholds.minimumSavingsRatio,
        ),
        savingsGate(
            "listing_bytes_p95",
            baseline.summary.listingImageBytesP95,
            candidate.summary.listingImageBytesP95,
            thresholds.minimumSavingsRatio,
        ),
        exactGate("warm_encodes", candidate.summary.warmEncodes, 0),
        exactGate("warm_upstream_reads", candidate.summary.warmUpstreamReads, 0),
        exactGate("failed_images", candidate.summary.failedImages, 0),
        exactGate("corpus_transform_errors", corpusTransformErrors(candidate), 0),
        exactGate("descriptor_mismatches", descriptorMismatches(candidate), 0),
        exactGate("single_flight_excess_encodes", singleFlightExcessEncodes(candidate), 0),
        exactGate("original_rollback_mismatches", originalRollbackMismatches(baseline), 0),
        foregroundGate(baseline, candidate, thresholds),
        coldForegroundGate(candidate, thresholds.coldForegroundMaximumMs ?? 75),
    ];
    return {
        schema: "cms.image-performance.comparison.v1",
        baselineLabel: baseline.label,
        candidateLabel: candidate.label,
        passed: gates.every(({ passed }) => passed),
        gates,
    };
}

function corpusTransformErrors(artifact: ImagePerformanceArtifact): number {
    return artifact.corpus.assets.reduce(
        (count, asset) =>
            count + asset.variants.filter((variant) => variant.error || variant.outputBytes === null).length,
        0,
    );
}

function descriptorMismatches(artifact: ImagePerformanceArtifact): number {
    return artifact.corpus.assets.reduce(
        (count, asset) =>
            count +
            asset.variants.filter(
                (variant) => variant.actualWidth !== Math.min(variant.targetWidth, asset.sourceWidth),
            ).length,
        0,
    );
}

function singleFlightExcessEncodes(artifact: ImagePerformanceArtifact): number {
    return artifact.listing
        .filter(({ phase }) => phase === "cold")
        .reduce(
            (excess, sample) => excess + Math.max(0, sample.stats.encodes - expectedColdEncodes(artifact, sample)),
            0,
        );
}

function expectedColdEncodes(artifact: ImagePerformanceArtifact, sample: ListingSample): number {
    const keys = new Set<string>();
    for (let index = 0; index < artifact.configuration.cardCount; index++) {
        const asset = artifact.corpus.assets[index % artifact.corpus.assets.length]!;
        const displayWidth = artifact.configuration.viewportWidth * (sample.layout === "narrow" ? 0.3 : 1);
        const required = Math.ceil(displayWidth * sample.dpr);
        const producible = artifact.configuration.ladder.filter((width) => width <= asset.sourceWidth);
        const selected = producible.find((width) => width >= required) ?? producible.at(-1);
        if (selected) {
            keys.add(`${asset.assetId}:${selected}`);
        }
    }
    return keys.size;
}

function originalRollbackMismatches(artifact: ImagePerformanceArtifact): number {
    if (artifact.adapter !== "original") {
        return 1;
    }
    return artifact.corpus.assets.reduce(
        (count, asset) =>
            count +
            asset.variants.filter(
                (variant) =>
                    variant.actualWidth !== asset.sourceWidth ||
                    variant.actualHeight !== asset.sourceHeight ||
                    variant.outputBytes !== asset.sourceBytes,
            ).length,
        0,
    );
}

function savingsGate(id: string, baseline: number, candidate: number, minimum: number): GateResult {
    const savings = baseline > 0 ? 1 - candidate / baseline : candidate === 0 ? 1 : Number.NEGATIVE_INFINITY;
    return {
        id,
        passed: savings >= minimum,
        actual: rounded(savings),
        expected: `>=${rounded(minimum)}`,
    };
}

function exactGate(id: string, actual: number, expected: number): GateResult {
    return { id, passed: actual === expected, actual, expected };
}

function foregroundGate(
    baseline: ImagePerformanceArtifact,
    candidate: ImagePerformanceArtifact,
    thresholds: ComparisonThresholds,
): GateResult {
    const maximum =
        baseline.summary.foregroundP95Ms * (1 + thresholds.foregroundRegressionRatio) +
        thresholds.foregroundAllowanceMs;
    return {
        id: "foreground_p95",
        passed: candidate.summary.foregroundP95Ms <= maximum,
        actual: candidate.summary.foregroundP95Ms,
        expected: `<=${rounded(maximum)}`,
    };
}

function coldForegroundGate(candidate: ImagePerformanceArtifact, maximum: number): GateResult {
    const actual = percentile(
        candidate.listing.filter(({ phase }) => phase === "cold").map(({ foregroundP95Ms }) => foregroundP95Ms),
        0.95,
    );
    return {
        id: "cold_foreground_p95_absolute",
        passed: actual <= maximum,
        actual: rounded(actual),
        expected: `<=${rounded(maximum)}`,
    };
}

function assertComparable(baseline: ImagePerformanceArtifact, candidate: ImagePerformanceArtifact): void {
    if (baseline.corpus.fingerprint !== candidate.corpus.fingerprint) {
        throw new Error("Baseline and candidate corpus fingerprints differ");
    }
    if (JSON.stringify(baseline.configuration) !== JSON.stringify(candidate.configuration)) {
        throw new Error("Baseline and candidate benchmark configurations differ");
    }
    const baselineKeys = baseline.listing.map(sampleKey).sort();
    const candidateKeys = candidate.listing.map(sampleKey).sort();
    if (JSON.stringify(baselineKeys) !== JSON.stringify(candidateKeys)) {
        throw new Error("Baseline and candidate listing matrices differ");
    }
}

function sampleKey(sample: ListingSample): string {
    return [sample.phase, sample.layout, sample.dpr, sample.users, sample.repetition].join(":");
}
