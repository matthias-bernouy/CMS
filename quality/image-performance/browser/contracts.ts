import type { IMAGE_PERFORMANCE_BROWSER_SCHEMA, IMAGE_PERFORMANCE_PROVENANCE_SCHEMA } from "../contracts";

export type BrowserImageEvidence = {
    currentSrc: string;
    selectedWidth: number | null;
    responseStatus: number | null;
    decodedWidth: number | null;
    decodedHeight: number | null;
    responseContentType: string | null;
};

export type BrowserResponseCaptureEvidence = {
    url: string;
    responseStatus: number;
    responseContentType: string | null;
    bodyBytes: number | null;
};

export type BrowserDomProbeEvidence = {
    empty: { src: string | null; srcset: string | null };
    unresolved: Record<"source" | "width" | "height" | "sizes", { src: string | null; srcset: string | null }>;
    recycled: {
        firstSizes: string | null;
        secondSizes: string | null;
        secondSrc: string | null;
        clearedSizes: string | null;
        clearedSrc: string | null;
        clearedSrcset: string | null;
        clearedWidth: string | null;
        clearedHeight: string | null;
    };
};

export type BrowserPerformanceCase = {
    rollout: "baseline" | "candidate";
    loading: "lazy" | "eager";
    dpr: number;
    cls: number;
    images: {
        narrow: BrowserImageEvidence;
        wide: BrowserImageEvidence;
    };
    requests: string[];
    responseCaptures: BrowserResponseCaptureEvidence[];
    activationOrder: Record<string, string[]>;
    domProbes: BrowserDomProbeEvidence;
    currentSrcMismatches: number;
    requestMismatches: number;
    responseCaptureMismatches: number;
    doubleFetches: number;
    representationMismatches: number;
    activationOrderMismatches: number;
    unresolvedBindingMismatches: number;
    recycleMismatches: number;
};

export type BrowserPerformanceProvenance = {
    schema: typeof IMAGE_PERFORMANCE_PROVENANCE_SCHEMA;
    suiteId: string;
    generatedAtMs: number;
    codeFingerprint: string;
    suiteFingerprint: string;
    candidateEvidenceFingerprint: string;
    engine: {
        name: "chromium";
        version: string;
    };
    component: {
        productionEntry: true;
        entryFingerprint: string;
        enabledBundleFingerprint: string;
        disabledBundleFingerprint: string;
    };
    adapter: {
        name: string;
        implementation: {
            mode: "original" | "source-image";
            recipeId: string;
            encoderIdentity: string;
        };
    };
};

export type BrowserPerformanceArtifact = {
    schema: typeof IMAGE_PERFORMANCE_BROWSER_SCHEMA;
    provenance: BrowserPerformanceProvenance;
    passed: boolean;
    cases: BrowserPerformanceCase[];
    summary: {
        caseMatrixMismatches: number;
        currentSrcMismatches: number;
        requestMismatches: number;
        responseCaptureMismatches: number;
        doubleFetches: number;
        representationMismatches: number;
        activationOrderMismatches: number;
        unresolvedBindingMismatches: number;
        recycleMismatches: number;
        rollbackMismatches: number;
        baselineClsMaximum: number;
        candidateClsMaximum: number;
        clsRegressionMaximum: number;
    };
};
