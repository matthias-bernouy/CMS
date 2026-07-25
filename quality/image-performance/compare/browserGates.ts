import type { BrowserPerformanceArtifact, GateResult, ImagePerformanceArtifact } from "../contracts";
import { buildBrowserPerformanceArtifact } from "../browser/evidence";
import { rounded } from "../core/math";
import { stableSerialize } from "../provenance";
import { assertNonNegativeFiniteNumbers } from "./performanceValidation";

export type BrowserComparisonThresholds = {
    browserClsMaximum: number;
    browserClsRegressionAllowance: number;
};

export function browserPerformanceGates(
    browser: BrowserPerformanceArtifact,
    candidate: ImagePerformanceArtifact,
    thresholds: BrowserComparisonThresholds,
): GateResult[] {
    assertNonNegativeFiniteNumbers(browser, "browser");
    const verified = buildBrowserPerformanceArtifact(browser.cases, browser.provenance);
    if (
        stableSerialize(verified.cases) !== stableSerialize(browser.cases) ||
        stableSerialize(verified.summary) !== stableSerialize(browser.summary) ||
        verified.passed !== browser.passed
    ) {
        throw new Error("Browser summary or derived case evidence does not match raw measurements");
    }
    const fixtureAdapter = browser.provenance.adapter;
    return [
        exactGate("browser_fixture_adapter_name", fixtureAdapter?.name ?? "missing", candidate.adapter),
        exactGate(
            "browser_fixture_adapter_implementation",
            stableSerialize(fixtureAdapter?.implementation ?? null),
            stableSerialize(candidate.implementation),
        ),
        exactGate("browser_case_matrix_mismatches", verified.summary.caseMatrixMismatches, 0),
        exactGate("browser_current_src_mismatches", verified.summary.currentSrcMismatches, 0),
        exactGate("browser_request_mismatches", verified.summary.requestMismatches, 0),
        exactGate("browser_response_capture_mismatches", verified.summary.responseCaptureMismatches, 0),
        exactGate("browser_double_fetches", verified.summary.doubleFetches, 0),
        exactGate("browser_representation_mismatches", verified.summary.representationMismatches, 0),
        exactGate("browser_activation_order_mismatches", verified.summary.activationOrderMismatches, 0),
        exactGate("browser_unresolved_binding_mismatches", verified.summary.unresolvedBindingMismatches, 0),
        exactGate("browser_recycle_mismatches", verified.summary.recycleMismatches, 0),
        exactGate("browser_rollback_mismatches", verified.summary.rollbackMismatches, 0),
        maximumGate(
            "browser_candidate_cls_maximum",
            verified.summary.candidateClsMaximum,
            thresholds.browserClsMaximum,
        ),
        maximumGate(
            "browser_cls_regression_maximum",
            verified.summary.clsRegressionMaximum,
            thresholds.browserClsRegressionAllowance,
        ),
    ];
}

function exactGate(id: string, actual: number | string, expected: number | string): GateResult {
    return { id, passed: actual === expected, actual, expected };
}

function maximumGate(id: string, actual: number, maximum: number): GateResult {
    return { id, passed: actual <= maximum, actual: rounded(actual), expected: `<=${rounded(maximum)}` };
}
