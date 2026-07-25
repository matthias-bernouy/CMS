import { describe, expect, test } from "bun:test";
import { buildBrowserPerformanceArtifact } from "../browser/evidence";
import { compareArtifacts } from "../compare/gates";
import type { ImagePerformanceArtifact } from "../contracts";
import { summarizeListing } from "../core/math";
import { artifact, comparisonThresholds } from "./fixtures/artifacts";
import { browserArtifact } from "./fixtures/browserArtifact";

describe("image performance gates", () => {
    test("accepts byte savings and bounded p95 of scenario foreground p95 values", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 150, 200, 0, 20);
        const comparison = compare(baseline, candidate);

        expect(comparison.passed).toBe(true);
        expect(comparison.gates.every(({ passed }) => passed)).toBe(true);
    });

    test("rejects a warm encode even when byte savings pass", () => {
        const comparison = compare(artifact("baseline", 1_000, 1_000, 0, 10), artifact("candidate", 100, 100, 1, 10));

        expect(comparison.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "warm_encodes")?.passed).toBe(false);
    });

    test("rejects false descriptors and excess cold encodes", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.corpus.assets[0]!.variants[0]!.actualWidth = 128;
        candidate.listing[0]!.stats.encodes = 13;

        const comparison = compare(baseline, candidate);

        expect(comparison.gates.find(({ id }) => id === "descriptor_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "cold_single_flight_encode_mismatches")?.passed).toBe(false);
    });

    test("rejects a vertically distorted derivative and a changed passthrough", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.corpus.assets[0]!.variants[0]!.actualHeight = 10;
        candidate.corpus.assets[1]!.passthrough.matchesSourceBytes = false;

        const comparison = compare(baseline, candidate);

        expect(comparison.gates.find(({ id }) => id === "descriptor_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "source_passthrough_mismatches")?.passed).toBe(false);
    });

    test("rejects catastrophic thumbnail drift and explicit CPU or RSS budget overruns", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.corpus.assets[0]!.variants[0]!.normalizedThumbnailMae = 0.2;
        candidate.listing[0]!.cpuMs = 10_001;
        candidate.listing[1]!.peakRssBytes = 1_000_000_001;

        const comparison = compare(baseline, candidate);

        expect(comparison.gates.find(({ id }) => id === "normalized_thumbnail_mae")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "scenario_cpu_ms")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "peak_rss_bytes")?.passed).toBe(false);
    });

    test("rejects a baseline error or same-size mutation hidden behind original dimensions", () => {
        const failedBaseline = artifact("baseline", 1_000, 1_000, 0, 10);
        failedBaseline.corpus.assets[0]!.variants[0]!.error = "status_500";
        failedBaseline.corpus.assets[0]!.variants[0]!.matchesSourceBytes = null;
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const failedComparison = compare(failedBaseline, candidate);
        expect(failedComparison.gates.find(({ id }) => id === "baseline_corpus_errors")?.passed).toBe(false);

        const mutatedBaseline = artifact("baseline", 1_000, 1_000, 0, 10);
        mutatedBaseline.corpus.assets[0]!.variants[0]!.matchesSourceBytes = false;
        const mutationComparison = compare(mutatedBaseline, candidate);
        expect(mutationComparison.gates.find(({ id }) => id === "legacy_original_mismatches")?.passed).toBe(false);
    });

    test("gates scenario-distribution and absolute cache-cold foreground p95", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const regressed = artifact("candidate", 100, 100, 0, 21);
        const coldSpike = artifact("candidate", 100, 100, 0, 10);
        coldSpike.listing
            .filter(({ phase }) => phase === "cold")
            .forEach((sample) => {
                sample.foregroundP95Ms = 76;
            });
        coldSpike.summary = summarizeListing(coldSpike.listing);

        expect(compare(baseline, regressed).gates.find(({ id }) => id === "foreground_p95")?.passed).toBe(false);
        expect(compare(baseline, coldSpike).gates.find(({ id }) => id === "cold_foreground_p95_absolute")?.passed).toBe(
            false,
        );
    });

    test("rejects a candidate corpus outside the explicit approval", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.corpus.fingerprint = "c".repeat(64);

        expect(() => compare(baseline, candidate)).toThrow("explicitly approved corpus fingerprint");
    });

    test("rejects excess upstream reads for a cold public single-flight key", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.listing[0]!.stats.upstreamReads = 13;

        const comparison = compare(baseline, candidate);

        expect(comparison.gates.find(({ id }) => id === "cold_single_flight_upstream_mismatches")?.passed).toBe(false);
    });

    test("fails closed when browser or single-flight measurements are missing", () => {
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const incompleteBrowser = browserArtifact(candidate);
        incompleteBrowser.cases.pop();

        expect(() =>
            compareArtifacts(
                artifact("baseline", 1_000, 1_000, 0, 10),
                candidate,
                incompleteBrowser,
                comparisonThresholds(),
            ),
        ).toThrow("Browser summary");
    });

    test("gates real browser currentSrc, network, double-fetch, and CLS evidence", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        let browser = browserArtifact(candidate);
        const candidateCase = browser.cases.find(({ rollout }) => rollout === "candidate")!;
        candidateCase.images.narrow.currentSrc = "http://fixture.invalid/image/original.png?slot=narrow&cms-width=64";
        candidateCase.images.wide.decodedWidth = 1_600;
        candidateCase.images.wide.responseContentType = "image/png";
        candidateCase.requests.push(candidateCase.requests[0]!);
        candidateCase.domProbes.unresolved.source.src =
            "http://fixture.invalid/image/original.png?slot=unresolved-source";
        candidateCase.domProbes.recycled.clearedSizes = null;
        candidateCase.cls = 0.01;
        const baselineCase = browser.cases.find(({ rollout }) => rollout === "baseline")!;
        baselineCase.images.narrow.currentSrc = "http://fixture.invalid/image/original.png?slot=narrow&cms-width=384";
        browser = buildBrowserPerformanceArtifact(browser.cases, browser.provenance);

        const comparison = compareArtifacts(baseline, candidate, browser, comparisonThresholds());

        expect(comparison.gates.find(({ id }) => id === "browser_current_src_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_request_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_response_capture_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_double_fetches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_representation_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_unresolved_binding_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_recycle_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_rollback_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_candidate_cls_maximum")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_cls_regression_maximum")?.passed).toBe(false);
    });

    test("gates non-200 rollback evidence and consumes every duplicate response body", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        let browser = browserArtifact(candidate);
        const baselineCase = browser.cases.find(({ rollout }) => rollout === "baseline")!;
        baselineCase.images.narrow.responseStatus = 500;
        baselineCase.responseCaptures[0]!.responseStatus = 500;
        const candidateCase = browser.cases.find(({ rollout }) => rollout === "candidate")!;
        const duplicateRequest = candidateCase.requests[0]!;
        candidateCase.requests.push(duplicateRequest);
        candidateCase.responseCaptures.push({
            ...candidateCase.responseCaptures[0]!,
            bodyBytes: null,
        });
        browser = buildBrowserPerformanceArtifact(browser.cases, browser.provenance);

        const comparison = compareArtifacts(baseline, candidate, browser, comparisonThresholds());

        expect(comparison.gates.find(({ id }) => id === "browser_representation_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_rollback_mismatches")?.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_response_capture_mismatches")?.passed).toBe(false);
    });
});

function compare(baseline: ImagePerformanceArtifact, candidate: ImagePerformanceArtifact) {
    return compareArtifacts(baseline, candidate, browserArtifact(candidate), comparisonThresholds());
}
