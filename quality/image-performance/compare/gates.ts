import type {
    BrowserPerformanceArtifact,
    GateResult,
    ImagePerformanceArtifact,
    ImagePerformanceComparison,
    ImagePerformanceGateThresholds,
    ListingSample,
} from "../contracts";
import { percentile, rounded } from "../core/math";
import { browserEvidenceFingerprint, performanceEvidenceFingerprint } from "../provenance";
import { artifactIntegrityGates } from "./artifactGates";
import { browserPerformanceGates, type BrowserComparisonThresholds } from "./browserGates";
import { assertPerformanceArtifact } from "./performanceValidation";
import { assertComparisonProvenance, type ProvenanceExpectations } from "./provenanceValidation";

export type ComparisonThresholds = BrowserComparisonThresholds &
    ProvenanceExpectations & {
        minimumSavingsRatio: number;
        foregroundRegressionRatio: number;
        foregroundAllowanceMs: number;
        coldForegroundMaximumMs: number;
        maximumThumbnailMae: number;
        maximumPeakRssBytes: number;
        maximumScenarioCpuMs: number;
        approvedCorpusFingerprint: string;
    };

export function compareArtifacts(
    baseline: ImagePerformanceArtifact,
    candidate: ImagePerformanceArtifact,
    browser: BrowserPerformanceArtifact,
    thresholds: ComparisonThresholds,
): ImagePerformanceComparison {
    assertPerformanceArtifact(baseline, "baseline", thresholds.approvedCorpusFingerprint);
    assertPerformanceArtifact(candidate, "candidate", thresholds.approvedCorpusFingerprint);
    assertComparable(baseline, candidate);
    assertComparisonProvenance(baseline, candidate, browser, thresholds);
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
        ...artifactIntegrityGates(baseline, candidate, thresholds.maximumThumbnailMae),
        ...browserPerformanceGates(browser, candidate, thresholds),
        foregroundGate(baseline, candidate, thresholds),
        coldForegroundGate(candidate, thresholds.coldForegroundMaximumMs),
        maximumObservedGate(
            "peak_rss_bytes",
            candidate.listing.map(({ peakRssBytes }) => peakRssBytes),
            thresholds.maximumPeakRssBytes,
        ),
        maximumObservedGate(
            "scenario_cpu_ms",
            candidate.listing.map(({ cpuMs }) => cpuMs),
            thresholds.maximumScenarioCpuMs,
        ),
    ];
    return {
        schema: "cms.image-performance.comparison.v5",
        baselineLabel: baseline.label,
        candidateLabel: candidate.label,
        generatedAtMs: thresholds.nowMs,
        evidence: {
            suiteId: candidate.provenance.suiteId,
            codeFingerprint: candidate.provenance.codeFingerprint,
            corpusFingerprint: candidate.corpus.fingerprint,
            baselineArtifactFingerprint: performanceEvidenceFingerprint(baseline),
            candidateArtifactFingerprint: performanceEvidenceFingerprint(candidate),
            browserArtifactFingerprint: browserEvidenceFingerprint(browser),
        },
        thresholds: comparisonGateThresholds(thresholds),
        passed: gates.every(({ passed }) => passed),
        gates,
    };
}

function comparisonGateThresholds(thresholds: ComparisonThresholds): ImagePerformanceGateThresholds {
    return {
        minimumSavingsRatio: thresholds.minimumSavingsRatio,
        foregroundRegressionRatio: thresholds.foregroundRegressionRatio,
        foregroundAllowanceMs: thresholds.foregroundAllowanceMs,
        coldForegroundMaximumMs: thresholds.coldForegroundMaximumMs,
        browserClsMaximum: thresholds.browserClsMaximum,
        browserClsRegressionAllowance: thresholds.browserClsRegressionAllowance,
        maximumThumbnailMae: thresholds.maximumThumbnailMae,
        maximumPeakRssBytes: thresholds.maximumPeakRssBytes,
        maximumScenarioCpuMs: thresholds.maximumScenarioCpuMs,
        maxArtifactAgeMs: thresholds.maxArtifactAgeMs,
    };
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

function maximumObservedGate(id: string, values: number[], maximum: number): GateResult {
    const actual = Math.max(0, ...values);
    return {
        id,
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
    const corpusIdentity = (artifact: ImagePerformanceArtifact) => ({
        kind: artifact.corpus.kind,
        accepted: artifact.corpus.accepted,
        rejected: artifact.corpus.rejected,
        rejections: artifact.corpus.rejections,
        assets: artifact.corpus.assets.map(({ assetId, mediaType, sourceBytes, sourceWidth, sourceHeight }) => ({
            assetId,
            mediaType,
            sourceBytes,
            sourceWidth,
            sourceHeight,
        })),
    });
    if (JSON.stringify(corpusIdentity(baseline)) !== JSON.stringify(corpusIdentity(candidate))) {
        throw new Error("Baseline and candidate corpus metadata differ");
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
