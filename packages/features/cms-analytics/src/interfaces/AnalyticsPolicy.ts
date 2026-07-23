import type { AnalyticsPrivacyProfile } from "./AnalyticsPrivacy";
import { STRICT_ANALYTICS_LIMITS } from "./AnalyticsPrivacy";

export type AnalyticsCollectionPolicy = {
    profile: AnalyticsPrivacyProfile;
    enabled: boolean;
    visitorEstimation: boolean;
    ignoredReferrerDomains: readonly string[];
    referrerCapacity: number;
    rollupRetentionDays: number;
};

export const DEFAULT_ANALYTICS_COLLECTION_POLICY: AnalyticsCollectionPolicy = {
    profile: "privacy-strict",
    enabled: true,
    visitorEstimation: true,
    ignoredReferrerDomains: [],
    referrerCapacity: STRICT_ANALYTICS_LIMITS.referrerCapacity,
    rollupRetentionDays: STRICT_ANALYTICS_LIMITS.rollupRetentionDays,
};
