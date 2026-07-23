import type { AnalyticsEvent } from "../../interfaces/AnalyticsEvent";
import { DEFAULT_ANALYTICS_COLLECTION_POLICY, type AnalyticsCollectionPolicy } from "../../interfaces/AnalyticsPolicy";
import { assertSupportedAnalyticsProfile, STRICT_ANALYTICS_LIMITS } from "../../interfaces/AnalyticsPrivacy";

export function resolveAnalyticsPolicy(policy: Partial<AnalyticsCollectionPolicy> = {}): AnalyticsCollectionPolicy {
    const resolved = {
        profile: policy.profile ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.profile,
        enabled: policy.enabled ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.enabled,
        visitorEstimation: policy.visitorEstimation ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.visitorEstimation,
        ignoredReferrerDomains:
            policy.ignoredReferrerDomains ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.ignoredReferrerDomains,
        referrerCapacity: policy.referrerCapacity ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.referrerCapacity,
        rollupRetentionDays: policy.rollupRetentionDays ?? DEFAULT_ANALYTICS_COLLECTION_POLICY.rollupRetentionDays,
    };
    assertSupportedAnalyticsProfile(resolved.profile);
    if (
        !Number.isInteger(resolved.referrerCapacity) ||
        resolved.referrerCapacity < 1 ||
        resolved.referrerCapacity > 256
    ) {
        throw new Error("analytics referrer capacity must be an integer between 1 and 256");
    }
    if (
        !Number.isInteger(resolved.rollupRetentionDays) ||
        resolved.rollupRetentionDays < 1 ||
        resolved.rollupRetentionDays > STRICT_ANALYTICS_LIMITS.maximumRollupRetentionDays
    ) {
        throw new Error(
            `analytics rollup retention must be between 1 and ${STRICT_ANALYTICS_LIMITS.maximumRollupRetentionDays} days`,
        );
    }
    return resolved;
}

export function isContentView(
    event: AnalyticsEvent,
    policy: AnalyticsCollectionPolicy = DEFAULT_ANALYTICS_COLLECTION_POLICY,
): boolean {
    const successfulHtmlStatus = (event.status >= 200 && event.status < 300) || event.status === 304;
    return policy.enabled && !event.exclusionReason && successfulHtmlStatus && Boolean(event.pageId);
}

export function isIgnoredReferrer(domain: string, policy: AnalyticsCollectionPolicy): boolean {
    const normalized = domain.toLowerCase();
    return policy.ignoredReferrerDomains.some((ignored) => {
        const suffix = ignored.toLowerCase().replace(/^\./, "");
        return normalized === suffix || normalized.endsWith(`.${suffix}`);
    });
}
