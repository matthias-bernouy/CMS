import { describe, expect, test } from "bun:test";
import { compareArtifacts } from "../compare/gates";
import { validateSmokeArtifacts } from "../compare/smoke";
import type { BrowserPerformanceArtifact, ImagePerformanceArtifact } from "../contracts";
import { summarizeListing } from "../core/math";
import {
    browserEvidenceFingerprint,
    createPerformanceProvenance,
    IMAGE_PERFORMANCE_CODE_INPUTS,
    performanceEvidenceFingerprint,
} from "../provenance";
import { BROWSER_COMPONENT_ROLLOUT, buildCurrentBrowserComponent } from "../browser/componentBuild";
import { artifact, comparisonThresholds, TEST_CODE_FINGERPRINT, TEST_NOW_MS } from "./fixtures/artifacts";
import { browserArtifact } from "./fixtures/browserArtifact";

describe("image performance artifact hardening", () => {
    test("benchmarks the public rollout while keeping private source images disabled", () => {
        expect(BROWSER_COMPONENT_ROLLOUT).toEqual({
            enabled: { public: true, private: false },
            disabled: { public: false, private: false },
        });
    });

    test("builds both split-rollout production bundles without unresolved defines", async () => {
        const build = await buildCurrentBrowserComponent();
        for (const script of [build.enabledScript, build.disabledScript]) {
            expect(script).not.toContain("__CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__");
            expect(script).not.toContain("__CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__");
        }
        expect(build.enabledBundleFingerprint).not.toBe(build.disabledBundleFingerprint);
    });

    test("fingerprints the production browser runtime dependency closure", () => {
        expect(IMAGE_PERFORMANCE_CODE_INPUTS).toContain("packages/foundation/components/package.json");
        expect(IMAGE_PERFORMANCE_CODE_INPUTS).toContain("packages/foundation/components/src");
    });

    test("rejects a raw listing mutation hidden behind an unchanged summary", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.listing.forEach((sample, index) => {
            sample.imageBytes = baseline.listing[index]!.imageBytes;
        });

        expect(() => compare(baseline, candidate, browserArtifact(candidate))).toThrow(
            "summary does not match raw listing",
        );
    });

    test("rejects a forged summary even when the raw samples are untouched", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.summary.listingImageBytesMedian = 1;

        expect(() => compare(baseline, candidate, browserArtifact(candidate))).toThrow(
            "summary does not match raw listing",
        );
    });

    test("rejects browser fixture evidence without traceable provenance", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const browser = browserArtifact(candidate);
        delete (browser as Partial<BrowserPerformanceArtifact>).provenance;

        expect(() => compare(baseline, candidate, browser)).toThrow("browser evidence is stale");
    });

    test("rejects stale artifacts and code fingerprint mismatches", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const stale = artifact("candidate", 100, 100, 0, 10);
        stale.provenance.generatedAtMs = TEST_NOW_MS - 120_000;
        expect(() => compare(baseline, stale, browserArtifact(stale))).toThrow("candidate evidence is stale");

        const candidate = artifact("candidate", 100, 100, 0, 10);
        const browser = browserArtifact(candidate);
        browser.provenance.codeFingerprint = "f".repeat(64);
        expect(() => compare(baseline, candidate, browser)).toThrow("browser evidence is stale");
    });

    test("rejects mismatched recipe and implementation fingerprints", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const recipeMismatch = artifact("candidate", 100, 100, 0, 10);
        recipeMismatch.provenance.recipeFingerprint = "c".repeat(64);
        expect(() => compare(baseline, recipeMismatch, browserArtifact(recipeMismatch))).toThrow(
            "Invalid candidate performance provenance",
        );

        const implementationMismatch = artifact("candidate", 100, 100, 0, 10);
        implementationMismatch.provenance.implementationFingerprint = "c".repeat(64);
        expect(() => compare(baseline, implementationMismatch, browserArtifact(implementationMismatch))).toThrow(
            "Invalid candidate performance provenance",
        );
    });

    test("binds Chromium evidence to the exact candidate artifact", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const browser = browserArtifact(candidate);
        candidate.listing[0]!.foregroundP50Ms += 1;
        candidate.summary = summarizeListing(candidate.listing);

        expect(() => compare(baseline, candidate, browser)).toThrow("exact candidate artifact");
    });

    test("binds the Chromium fixture adapter implementation to the candidate", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const browser = browserArtifact(candidate);
        browser.provenance.adapter.implementation.encoderIdentity = "another-sharp-build";

        const comparison = compare(baseline, candidate, browser);

        expect(comparison.passed).toBe(false);
        expect(comparison.gates.find(({ id }) => id === "browser_fixture_adapter_implementation")?.passed).toBe(false);
    });

    test("rejects a valid candidate captured under another suite id", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.provenance = createPerformanceProvenance({
            artifact: candidate,
            suiteId: "another-suite",
            codeFingerprint: TEST_CODE_FINGERPRINT,
            generatedAtMs: TEST_NOW_MS - 1_000,
            runtimeVersion: "1.3.14-test",
        });

        expect(() => compare(baseline, candidate, browserArtifact(candidate))).toThrow("provenance suites differ");
    });

    test("rejects baseline and candidate measurements from different runtimes or hosts", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.provenance.runtime = {
            ...candidate.provenance.runtime,
            environmentFingerprint: "f".repeat(64),
        };

        expect(() => compare(baseline, candidate, browserArtifact(candidate))).toThrow("runtime environments differ");
    });

    test("rejects non-finite measurements and incomplete listing matrices", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const nonFinite = artifact("candidate", 100, 100, 0, 10);
        nonFinite.listing[0]!.cpuMs = Number.POSITIVE_INFINITY;
        expect(() => compare(baseline, nonFinite, browserArtifact(nonFinite))).toThrow("non-finite");

        const incomplete = artifact("candidate", 100, 100, 0, 10);
        incomplete.listing.pop();
        incomplete.summary = summarizeListing(incomplete.listing);
        expect(() => compare(baseline, incomplete, browserArtifact(incomplete))).toThrow("matrix is incomplete");
    });

    test("rejects incomplete current-schema corpus evidence with a stable diagnostic", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        delete (candidate.corpus as Partial<ImagePerformanceArtifact["corpus"]>).rejections;

        expect(() => compare(baseline, candidate, browserArtifact(candidate))).toThrow(
            "Invalid candidate corpus rejection summary",
        );
    });

    test("locks release evidence to the canonical viewport and approved corpus", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.configuration.viewportWidth = 1;
        expect(() => compare(baseline, candidate, browserArtifact(candidate))).toThrow("canonical 1000px viewport");

        const thresholds = comparisonThresholds();
        thresholds.approvedCorpusFingerprint = "f".repeat(64);
        const approvedCandidate = artifact("candidate", 100, 100, 0, 10);
        expect(() =>
            compareArtifacts(baseline, approvedCandidate, browserArtifact(approvedCandidate), thresholds),
        ).toThrow("explicitly approved corpus fingerprint");
    });

    test("rejects Chromium evidence whose production bundles no longer match the workspace", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const thresholds = comparisonThresholds();
        thresholds.currentComponentBuild.enabledBundleFingerprint = "f".repeat(64);

        expect(() => compareArtifacts(baseline, candidate, browserArtifact(candidate), thresholds)).toThrow(
            "production-bundle provenance",
        );
    });

    test("binds the comparison output to all evidence, thresholds, and generation time", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const browser = browserArtifact(candidate);
        const thresholds = comparisonThresholds();
        const comparison = compareArtifacts(baseline, candidate, browser, thresholds);

        expect(comparison).toMatchObject({
            schema: "cms.image-performance.comparison.v5",
            generatedAtMs: TEST_NOW_MS,
            evidence: {
                suiteId: candidate.provenance.suiteId,
                codeFingerprint: candidate.provenance.codeFingerprint,
                corpusFingerprint: candidate.corpus.fingerprint,
                baselineArtifactFingerprint: performanceEvidenceFingerprint(baseline),
                candidateArtifactFingerprint: performanceEvidenceFingerprint(candidate),
                browserArtifactFingerprint: browserEvidenceFingerprint(browser),
            },
            thresholds: {
                minimumSavingsRatio: thresholds.minimumSavingsRatio,
                maximumThumbnailMae: thresholds.maximumThumbnailMae,
                maximumPeakRssBytes: thresholds.maximumPeakRssBytes,
                maximumScenarioCpuMs: thresholds.maximumScenarioCpuMs,
            },
        });
    });

    test("fails the synthetic CI validator when the captured candidate reports an image failure", () => {
        const candidate = artifact("candidate", 100, 100, 0, 10);
        candidate.corpus.kind = "synthetic";
        candidate.listing[0]!.failedImages = 1;
        candidate.summary = summarizeListing(candidate.listing);
        const gates = validateSmokeArtifacts(candidate, browserArtifact(candidate), comparisonThresholds());

        expect(gates.find(({ id }) => id === "smoke_failed_images")?.passed).toBe(false);
    });

    test("rejects browser summaries that disagree with their raw cases", () => {
        const baseline = artifact("baseline", 1_000, 1_000, 0, 10);
        const candidate = artifact("candidate", 100, 100, 0, 10);
        const browser = browserArtifact(candidate);
        browser.cases[0]!.requests.push(browser.cases[0]!.requests[0]!);

        expect(() => compare(baseline, candidate, browser)).toThrow("Browser summary");
    });
});

function compare(
    baseline: ImagePerformanceArtifact,
    candidate: ImagePerformanceArtifact,
    browser: BrowserPerformanceArtifact,
) {
    return compareArtifacts(baseline, candidate, browser, comparisonThresholds());
}
