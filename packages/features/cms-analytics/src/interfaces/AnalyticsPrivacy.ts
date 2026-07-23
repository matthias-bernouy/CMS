export type AnalyticsPrivacyProfile = "privacy-strict" | "advanced";

export const ANALYTICS_VERSIONS = {
    profile: "privacy-strict-v1",
    filter: "strict-filter-v1",
    rollup: "strict-rollup-v1",
    visitorEstimator: "hllpp-p12-loglog-beta-v1",
    publication: "strict-publication-v1",
} as const;

export const STRICT_ANALYTICS_LIMITS = {
    hllPrecision: 12,
    publicationThreshold: 10,
    referrerCapacity: 64,
    sketchTtlHours: 48,
    rollupRetentionDays: 395,
    maximumRollupRetentionDays: 762,
} as const;

export function assertSupportedAnalyticsProfile(profile: AnalyticsPrivacyProfile): void {
    if (profile !== "privacy-strict") {
        throw new Error("advanced analytics requires a consent-aware collection gateway");
    }
}
