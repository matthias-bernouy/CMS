import {
    IMAGE_PERFORMANCE_BROWSER_SCHEMA,
    type BrowserPerformanceProvenance,
    type BrowserPerformanceArtifact,
    type BrowserPerformanceCase,
} from "../contracts";
import { evaluateBrowserCase } from "./case/evaluate";

const DEFAULT_CLS_MAXIMUM = 0.001;
const DEFAULT_CLS_REGRESSION_ALLOWANCE = 0.001;
type SummaryKey =
    | "currentSrcMismatches"
    | "requestMismatches"
    | "responseCaptureMismatches"
    | "doubleFetches"
    | "representationMismatches"
    | "activationOrderMismatches"
    | "unresolvedBindingMismatches"
    | "recycleMismatches";

export function buildBrowserPerformanceArtifact(
    cases: BrowserPerformanceCase[],
    provenance: BrowserPerformanceProvenance,
): BrowserPerformanceArtifact {
    const verifiedCases = cases.map((browserCase) => evaluateBrowserCase(browserCase));
    const summary = {
        caseMatrixMismatches: caseMatrixMismatches(verifiedCases),
        currentSrcMismatches: sum(verifiedCases, "currentSrcMismatches"),
        requestMismatches: sum(verifiedCases, "requestMismatches"),
        responseCaptureMismatches: sum(verifiedCases, "responseCaptureMismatches"),
        doubleFetches: sum(verifiedCases, "doubleFetches"),
        representationMismatches: sum(verifiedCases, "representationMismatches"),
        activationOrderMismatches: sum(verifiedCases, "activationOrderMismatches"),
        unresolvedBindingMismatches: sum(verifiedCases, "unresolvedBindingMismatches"),
        recycleMismatches: sum(verifiedCases, "recycleMismatches"),
        rollbackMismatches: rollbackMismatches(verifiedCases),
        baselineClsMaximum: maximumCls(verifiedCases, "baseline"),
        candidateClsMaximum: maximumCls(verifiedCases, "candidate"),
        clsRegressionMaximum: maximumClsRegression(verifiedCases),
    };
    return {
        schema: IMAGE_PERFORMANCE_BROWSER_SCHEMA,
        provenance,
        passed:
            summary.caseMatrixMismatches === 0 &&
            summary.currentSrcMismatches === 0 &&
            summary.requestMismatches === 0 &&
            summary.responseCaptureMismatches === 0 &&
            summary.doubleFetches === 0 &&
            summary.representationMismatches === 0 &&
            summary.activationOrderMismatches === 0 &&
            summary.unresolvedBindingMismatches === 0 &&
            summary.recycleMismatches === 0 &&
            summary.rollbackMismatches === 0 &&
            summary.candidateClsMaximum <= DEFAULT_CLS_MAXIMUM &&
            summary.clsRegressionMaximum <= DEFAULT_CLS_REGRESSION_ALLOWANCE,
        cases: verifiedCases,
        summary,
    };
}

function rollbackMismatches(cases: BrowserPerformanceCase[]): number {
    return cases
        .filter(({ rollout }) => rollout === "baseline")
        .reduce(
            (count, browserCase) =>
                count +
                browserCase.currentSrcMismatches +
                browserCase.requestMismatches +
                browserCase.responseCaptureMismatches +
                browserCase.doubleFetches +
                browserCase.representationMismatches,
            0,
        );
}

function caseMatrixMismatches(cases: BrowserPerformanceCase[]): number {
    const actual = new Map<string, number>();
    for (const browserCase of cases) {
        const key = `${browserCase.rollout}:${caseKey(browserCase)}`;
        actual.set(key, (actual.get(key) ?? 0) + 1);
    }
    const expected = new Set<string>();
    for (const rollout of ["baseline", "candidate"]) {
        for (const loading of ["lazy", "eager"]) {
            for (const dpr of [1, 2]) {
                expected.add(`${rollout}:${loading}:${dpr}`);
            }
        }
    }
    const missingOrDuplicated = [...expected].filter((key) => actual.get(key) !== 1).length;
    const unexpected = [...actual].filter(([key]) => !expected.has(key)).length;
    return missingOrDuplicated + unexpected;
}

function sum(cases: BrowserPerformanceCase[], key: SummaryKey): number {
    return cases.reduce((total, browserCase) => total + browserCase[key], 0);
}

function maximumCls(cases: BrowserPerformanceCase[], rollout: BrowserPerformanceCase["rollout"]): number {
    return Math.max(0, ...cases.filter((browserCase) => browserCase.rollout === rollout).map(({ cls }) => cls));
}

function maximumClsRegression(cases: BrowserPerformanceCase[]): number {
    const baselineByCase = new Map(
        cases
            .filter(({ rollout }) => rollout === "baseline")
            .map((browserCase) => [caseKey(browserCase), browserCase.cls]),
    );
    return Math.max(
        0,
        ...cases
            .filter(({ rollout }) => rollout === "candidate")
            .map((browserCase) => browserCase.cls - (baselineByCase.get(caseKey(browserCase)) ?? 0)),
    );
}

function caseKey(browserCase: BrowserPerformanceCase): string {
    return `${browserCase.loading}:${browserCase.dpr}`;
}
