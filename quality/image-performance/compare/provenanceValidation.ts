import {
    IMAGE_PERFORMANCE_PROVENANCE_SCHEMA,
    type BrowserPerformanceArtifact,
    type ImagePerformanceArtifact,
} from "../contracts";
import {
    implementationFingerprint,
    performanceEvidenceFingerprint,
    performanceSuiteFingerprint,
    recipeFingerprint,
    stableSerialize,
} from "../provenance";
import type { CurrentComponentBuild } from "../browser/componentBuild";

export type ProvenanceExpectations = {
    currentCodeFingerprint: string;
    currentComponentBuild: CurrentComponentBuild;
    nowMs: number;
    maxArtifactAgeMs: number;
};

export function assertComparisonProvenance(
    baseline: ImagePerformanceArtifact,
    candidate: ImagePerformanceArtifact,
    browser: BrowserPerformanceArtifact,
    expected: ProvenanceExpectations,
): void {
    assertPerformanceProvenance(baseline, expected, "baseline");
    assertCandidateBrowserProvenance(candidate, browser, expected);
    if (
        baseline.provenance.suiteId !== candidate.provenance.suiteId ||
        baseline.provenance.suiteFingerprint !== candidate.provenance.suiteFingerprint
    ) {
        throw new Error("Baseline and candidate provenance suites differ");
    }
    if (stableSerialize(baseline.provenance.runtime) !== stableSerialize(candidate.provenance.runtime)) {
        throw new Error("Baseline and candidate runtime environments differ");
    }
}

export function assertCandidateBrowserProvenance(
    candidate: ImagePerformanceArtifact,
    browser: BrowserPerformanceArtifact,
    expected: ProvenanceExpectations,
): void {
    assertPerformanceProvenance(candidate, expected, "candidate");
    const provenance = browser.provenance;
    assertFresh(provenance, expected, "browser");
    if (
        provenance.schema !== IMAGE_PERFORMANCE_PROVENANCE_SCHEMA ||
        provenance.suiteId !== candidate.provenance.suiteId ||
        provenance.codeFingerprint !== candidate.provenance.codeFingerprint ||
        provenance.suiteFingerprint !== candidate.provenance.suiteFingerprint
    ) {
        throw new Error("Browser and candidate provenance differ");
    }
    if (provenance.candidateEvidenceFingerprint !== performanceEvidenceFingerprint(candidate)) {
        throw new Error("Browser evidence does not reference the exact candidate artifact");
    }
    if (
        provenance.engine?.name !== "chromium" ||
        !provenance.engine.version?.trim() ||
        provenance.component?.productionEntry !== true ||
        !isHash(provenance.component.entryFingerprint) ||
        !isHash(provenance.component.enabledBundleFingerprint) ||
        !isHash(provenance.component.disabledBundleFingerprint) ||
        provenance.component.enabledBundleFingerprint === provenance.component.disabledBundleFingerprint ||
        provenance.component.entryFingerprint !== expected.currentComponentBuild.entryFingerprint ||
        provenance.component.enabledBundleFingerprint !== expected.currentComponentBuild.enabledBundleFingerprint ||
        provenance.component.disabledBundleFingerprint !== expected.currentComponentBuild.disabledBundleFingerprint ||
        provenance.generatedAtMs + 60_000 < candidate.provenance.generatedAtMs
    ) {
        throw new Error("Browser evidence lacks Chromium production-bundle provenance");
    }
}

function assertPerformanceProvenance(
    artifact: ImagePerformanceArtifact,
    expected: ProvenanceExpectations,
    role: "baseline" | "candidate",
): void {
    const provenance = artifact.provenance;
    assertFresh(provenance, expected, role);
    if (
        provenance.schema !== IMAGE_PERFORMANCE_PROVENANCE_SCHEMA ||
        !/^[a-zA-Z0-9._-]{1,80}$/.test(provenance.suiteId) ||
        provenance.recipeId !== artifact.implementation.recipeId ||
        provenance.recipeFingerprint !== recipeFingerprint() ||
        provenance.suiteFingerprint !==
            performanceSuiteFingerprint(artifact, provenance.suiteId, provenance.codeFingerprint) ||
        provenance.implementationFingerprint !==
            implementationFingerprint(artifact.implementation, provenance.codeFingerprint) ||
        provenance.runtime?.name !== "bun" ||
        !provenance.runtime.version?.trim() ||
        !provenance.runtime.platform?.trim() ||
        !provenance.runtime.architecture?.trim() ||
        !isHash(provenance.runtime.environmentFingerprint ?? "")
    ) {
        throw new Error(`Invalid ${role} performance provenance`);
    }
}

function assertFresh(
    provenance: { generatedAtMs?: number; codeFingerprint?: string } | undefined,
    expected: ProvenanceExpectations,
    role: string,
): void {
    if (
        !provenance ||
        !Number.isSafeInteger(provenance.generatedAtMs) ||
        !isHash(provenance.codeFingerprint ?? "") ||
        provenance.codeFingerprint !== expected.currentCodeFingerprint ||
        provenance.generatedAtMs! > expected.nowMs + 60_000 ||
        expected.nowMs - provenance.generatedAtMs! > expected.maxArtifactAgeMs
    ) {
        throw new Error(`${role} evidence is stale or has invalid code provenance`);
    }
}

function isHash(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value);
}
