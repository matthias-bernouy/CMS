import type { AnalyticsEvent } from "../../interfaces/AnalyticsEvent";
import { DEFAULT_ANALYTICS_COLLECTION_POLICY, type AnalyticsCollectionPolicy } from "../../interfaces/AnalyticsPolicy";

export function resolveAnalyticsPolicy(policy: Partial<AnalyticsCollectionPolicy> = {}): AnalyticsCollectionPolicy {
    return {
        requirePageId: policy.requirePageId ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.requirePageId,
        ignoredReferrerHosts: policy.ignoredReferrerHosts ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.ignoredReferrerHosts,
    };
}

export function isContentView(
    event: AnalyticsEvent,
    policy: AnalyticsCollectionPolicy = DEFAULT_ANALYTICS_COLLECTION_POLICY,
): boolean {
    const successfulHtmlStatus = (event.status >= 200 && event.status < 300) || event.status === 304;
    return event.device !== "bot" && successfulHtmlStatus && (!policy.requirePageId || Boolean(event.pageId));
}

export function isIgnoredReferrer(host: string, policy: AnalyticsCollectionPolicy): boolean {
    const normalized = host.toLowerCase();
    return policy.ignoredReferrerHosts.some((ignored) => {
        const suffix = ignored.toLowerCase().replace(/^\./, "");
        return normalized === suffix || normalized.endsWith(`.${suffix}`);
    });
}
