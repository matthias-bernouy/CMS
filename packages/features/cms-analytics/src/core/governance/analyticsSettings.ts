import type { AnalyticsSettings } from "../../interfaces/AnalyticsGovernance";
import { STRICT_ANALYTICS_LIMITS } from "../../interfaces/AnalyticsPrivacy";

export function validateAnalyticsSettings(value: AnalyticsSettings): AnalyticsSettings {
    if (
        !Number.isInteger(value.rollupRetentionDays) ||
        value.rollupRetentionDays < 1 ||
        value.rollupRetentionDays > STRICT_ANALYTICS_LIMITS.rollupRetentionDays
    ) {
        throw new Error(
            `analytics retention must be between 1 and ${STRICT_ANALYTICS_LIMITS.rollupRetentionDays} days`,
        );
    }
    if (value.privacyNoticeUrl) {
        const url = new URL(value.privacyNoticeUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("analytics privacy notice URL must use http or https");
        }
    }
    return {
        enabled: Boolean(value.enabled),
        visitorEstimation: Boolean(value.visitorEstimation),
        rollupRetentionDays: value.rollupRetentionDays,
        privacyNoticeUrl: value.privacyNoticeUrl.trim(),
    };
}
