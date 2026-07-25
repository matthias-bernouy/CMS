export const IMAGE_PERFORMANCE_SCHEMA = "cms.image-performance.v4" as const;
export const IMAGE_PERFORMANCE_BROWSER_SCHEMA = "cms.image-performance.browser.v4" as const;
export const IMAGE_PERFORMANCE_PROVENANCE_SCHEMA = "cms.image-performance.provenance.v1" as const;

export type AdapterStats = {
    cacheHits: number;
    encodes: number;
    upstreamReads: number;
};

export type CorpusResponseSample = {
    status: number | null;
    actualWidth: number | null;
    actualHeight: number | null;
    outputBytes: number | null;
    matchesSourceBytes: boolean | null;
    outputMediaType: string | null;
    outputFormat: string | null;
    normalizedThumbnailMae: number | null;
    durationMs: number;
    error?: string;
};

export type CorpusVariantSample = CorpusResponseSample & {
    targetWidth: number;
};

export type CorpusAssetSample = {
    assetId: string;
    mediaType: string;
    sourceBytes: number;
    sourceWidth: number;
    sourceHeight: number;
    passthrough: CorpusResponseSample;
    variants: CorpusVariantSample[];
};

export type CorpusRejections = {
    animated: number;
    invalidOrUnsafe: number;
    oversizedBytes: number;
};

export type ListingPhase = "cold" | "warm";
export type ListingLayout = "narrow" | "wide";

export type ListingSample = {
    phase: ListingPhase;
    layout: ListingLayout;
    dpr: number;
    users: number;
    repetition: number;
    imageBytes: number;
    failedImages: number;
    firstImageMs: number;
    allImagesMs: number;
    foregroundP50Ms: number;
    foregroundP95Ms: number;
    foregroundP99Ms: number;
    foregroundSamples: number;
    elapsedMs: number;
    cpuMs: number;
    peakRssBytes: number;
    stats: AdapterStats;
};

export type AdapterImplementation = {
    mode: "original" | "source-image";
    recipeId: string;
    encoderIdentity: string;
};

export type PerformanceRuntime = {
    name: "bun";
    version: string;
    platform: string;
    architecture: string;
    environmentFingerprint: string;
};

export type PerformanceProvenance = {
    schema: typeof IMAGE_PERFORMANCE_PROVENANCE_SCHEMA;
    suiteId: string;
    generatedAtMs: number;
    codeFingerprint: string;
    recipeId: string;
    recipeFingerprint: string;
    suiteFingerprint: string;
    implementationFingerprint: string;
    runtime: PerformanceRuntime;
};

export type ImagePerformanceArtifact = {
    schema: typeof IMAGE_PERFORMANCE_SCHEMA;
    label: string;
    adapter: string;
    implementation: AdapterImplementation;
    provenance: PerformanceProvenance;
    corpus: {
        kind: "directory" | "synthetic";
        fingerprint: string;
        accepted: number;
        rejected: number;
        rejections: CorpusRejections;
        assets: CorpusAssetSample[];
    };
    configuration: {
        ladder: number[];
        cardCount: number;
        viewportWidth: number;
        repetitions: number;
        users: number[];
        foregroundRequests: number;
        imageUpstreamDelayMs: number;
    };
    listing: ListingSample[];
    summary: {
        listingImageBytesMedian: number;
        listingImageBytesP95: number;
        foregroundP50Ms: number;
        foregroundP95Ms: number;
        foregroundP99Ms: number;
        warmEncodes: number;
        warmUpstreamReads: number;
        failedImages: number;
    };
};

export type {
    BrowserDomProbeEvidence,
    BrowserImageEvidence,
    BrowserPerformanceArtifact,
    BrowserPerformanceCase,
    BrowserPerformanceProvenance,
} from "./browser/contracts";

export type GateResult = {
    id: string;
    passed: boolean;
    actual: number | string;
    expected: number | string;
};

export type ImagePerformanceGateThresholds = {
    minimumSavingsRatio: number;
    foregroundRegressionRatio: number;
    foregroundAllowanceMs: number;
    coldForegroundMaximumMs: number;
    browserClsMaximum: number;
    browserClsRegressionAllowance: number;
    maximumThumbnailMae: number;
    maximumPeakRssBytes: number;
    maximumScenarioCpuMs: number;
    maxArtifactAgeMs: number;
};

export type ImagePerformanceComparison = {
    schema: "cms.image-performance.comparison.v5";
    baselineLabel: string;
    candidateLabel: string;
    generatedAtMs: number;
    evidence: {
        suiteId: string;
        codeFingerprint: string;
        corpusFingerprint: string;
        baselineArtifactFingerprint: string;
        candidateArtifactFingerprint: string;
        browserArtifactFingerprint: string;
    };
    thresholds: ImagePerformanceGateThresholds;
    passed: boolean;
    gates: GateResult[];
};
