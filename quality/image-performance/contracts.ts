export const IMAGE_PERFORMANCE_SCHEMA = "cms.image-performance.v1" as const;

export type AdapterStats = {
    cacheHits: number;
    encodes: number;
    upstreamReads: number;
};

export type CorpusVariantSample = {
    targetWidth: number;
    actualWidth: number | null;
    actualHeight: number | null;
    outputBytes: number | null;
    durationMs: number;
    error?: string;
};

export type CorpusAssetSample = {
    assetId: string;
    mediaType: string;
    sourceBytes: number;
    sourceWidth: number;
    sourceHeight: number;
    variants: CorpusVariantSample[];
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
    elapsedMs: number;
    cpuMs: number;
    peakRssBytes: number;
    stats: AdapterStats;
};

export type ImagePerformanceArtifact = {
    schema: typeof IMAGE_PERFORMANCE_SCHEMA;
    label: string;
    adapter: string;
    corpus: {
        fingerprint: string;
        accepted: number;
        rejected: number;
        assets: CorpusAssetSample[];
    };
    configuration: {
        ladder: number[];
        cardCount: number;
        viewportWidth: number;
        repetitions: number;
        users: number[];
        foregroundRequests: number;
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

export type GateResult = {
    id: string;
    passed: boolean;
    actual: number | string;
    expected: number | string;
};

export type ImagePerformanceComparison = {
    schema: "cms.image-performance.comparison.v1";
    baselineLabel: string;
    candidateLabel: string;
    passed: boolean;
    gates: GateResult[];
};
