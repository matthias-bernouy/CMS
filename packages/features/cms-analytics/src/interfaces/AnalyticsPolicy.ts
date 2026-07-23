export type AnalyticsCollectionPolicy = {
    /** Require a resolved CMS page before a successful response becomes a content view. */
    requirePageId: boolean;
    /** Referrer hosts excluded from acquisition counters. Content views still count. */
    ignoredReferrerHosts: readonly string[];
};

export const DEFAULT_ANALYTICS_COLLECTION_POLICY: AnalyticsCollectionPolicy = {
    requirePageId: false,
    ignoredReferrerHosts: [],
};
