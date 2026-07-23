import { ANALYTICS_VERSIONS, STRICT_ANALYTICS_LIMITS } from "../../interfaces/AnalyticsPrivacy";
import type {
    AnalyticsComplianceContext,
    AnalyticsComplianceCriterion,
    AnalyticsComplianceEvaluation,
    AnalyticsManualAttestation,
    AnalyticsSettings,
} from "../../interfaces/AnalyticsGovernance";
import { sha256HexAsync } from "../identity/sha256Hex";

export const ANALYTICS_CHECKLIST_VERSION = "cnil-audience-measurement-2026-01";

const MANUAL_CRITERIA = [
    ["purpose", "Audience measurement is the sole purpose"],
    ["notice", "The privacy notice and opt-out are published"],
    ["legal_basis", "The legal basis and ePrivacy analysis are documented"],
    ["processing_register", "The processing register is current"],
    ["processor_roles", "Controller, processor, and DPA roles are documented"],
    ["hosting_transfers", "Hosting and international transfers are reviewed"],
    ["other_trackers", "Other cookies, scripts, embeds, and integrations are audited"],
    ["infrastructure_logs", "CDN, proxy, firewall, and server logs are reviewed separately"],
    ["rights_procedure", "Data-subject request and Article 11 procedures are documented"],
    ["legal_review", "The responsible legal or DPO review is complete"],
] as const;

export async function evaluateAnalyticsCompliance(
    settings: AnalyticsSettings,
    context: AnalyticsComplianceContext,
    manual: Record<string, AnalyticsManualAttestation> = {},
    now = new Date(),
): Promise<AnalyticsComplianceEvaluation> {
    const automatic = automaticCriteria(settings, context);
    const criteria = [...automatic, ...MANUAL_CRITERIA.map(([id, label]) => manualCriterion(id, label, manual[id]))];
    const configurationFingerprint = await sha256HexAsync(
        JSON.stringify({
            profile: ANALYTICS_VERSIONS.profile,
            settings,
            context: { ...context, secretReady: Boolean(context.secretReady) },
        }),
    );
    return {
        evaluatedAt: now,
        checklistVersion: ANALYTICS_CHECKLIST_VERSION,
        configurationFingerprint,
        releaseReady: criteria.every(
            (criterion) => criterion.status === "pass" || criterion.status === "not-applicable",
        ),
        settings,
        context: { ...context, secretReady: Boolean(context.secretReady) },
        criteria,
    };
}

function automaticCriteria(
    settings: AnalyticsSettings,
    context: AnalyticsComplianceContext,
): AnalyticsComplianceCriterion[] {
    return [
        criterion("strict_profile", "The privacy-strict profile is active", "pass", ANALYTICS_VERSIONS.profile),
        criterion(
            "analytics_enabled",
            "Audience measurement is enabled",
            settings.enabled ? "pass" : "not-applicable",
            settings.enabled ? "Strict collection is enabled." : "Analytics is disabled.",
        ),
        criterion(
            "shared_secret",
            "A stable shared visitor HMAC secret is configured",
            !settings.visitorEstimation || context.secretReady ? "pass" : "fail",
            context.secretReady ? "Secret readiness check passed; the value is never exposed." : "Secret is missing.",
            "Configure one stable secret shared by every Delivery replica.",
        ),
        criterion(
            "site_scope",
            "Visitor input is site-scoped",
            context.siteScope ? "pass" : "fail",
            context.siteScope || "No site scope configured.",
            "Configure a stable tenant id or normalized public origin.",
        ),
        criterion(
            "visitor_minimisation",
            "Visitor estimation uses minimized, rotating input",
            "pass",
            "IPv4 /24, IPv6 /48, coarse device/browser, and site/day HMAC; the HMAC is not persisted.",
        ),
        criterion(
            "hll_state",
            "Visitor state is one global daily HLL++ sketch",
            "pass",
            `p=12, 64-bit input, 48-hour sketch TTL, estimator ${ANALYTICS_VERSIONS.visitorEstimator}.`,
        ),
        criterion(
            "proxy_trust",
            "Forwarded client addresses are trusted only behind a verified proxy",
            !context.trustProxy || context.trustedProxyVerified ? "pass" : "manual-review",
            context.trustProxy ? "Proxy trust is enabled." : "Forwarded headers are ignored.",
            "Verify that the proxy overwrites client-supplied forwarding headers.",
        ),
        criterion(
            "no_raw_events",
            "No raw analytics events or per-visitor rows are persisted",
            "pass",
            "Aggregate writes and HLL++ only.",
        ),
        criterion(
            "no_campaigns",
            "Campaign and marketing identifiers are disabled",
            "pass",
            "No UTM or click-id dimension exists.",
        ),
        criterion(
            "protected_reports",
            "Reports use closed buckets, k=10, and rounding",
            "pass",
            ANALYTICS_VERSIONS.publication,
        ),
        criterion(
            "filter_version",
            "The strict automation and route filter is versioned",
            "pass",
            ANALYTICS_VERSIONS.filter,
        ),
        criterion(
            "retention",
            "Aggregate retention is within the strict ceiling",
            settings.rollupRetentionDays <= STRICT_ANALYTICS_LIMITS.rollupRetentionDays ? "pass" : "fail",
            `${settings.rollupRetentionDays} days`,
            `Shorten retention to at most ${STRICT_ANALYTICS_LIMITS.rollupRetentionDays} days.`,
        ),
        criterion(
            "secure_cookie",
            "The public opt-out uses a secure cookie on HTTPS",
            context.secureCookie ? "pass" : "manual-review",
            context.secureCookie ? "Secure cookie is active." : "Public site is not configured as HTTPS.",
            "Use HTTPS in production.",
        ),
        criterion("public_opt_out", "A public no-JavaScript opt-out is available", "pass", context.optOutUrl),
    ];
}

function criterion(
    id: string,
    label: string,
    status: AnalyticsComplianceCriterion["status"],
    evidence: string,
    requiredAction?: string,
    mode: AnalyticsComplianceCriterion["mode"] = "automatic",
): AnalyticsComplianceCriterion {
    return { id, mode, label, status, evidence, ...(status !== "pass" && requiredAction ? { requiredAction } : {}) };
}

function manualCriterion(
    id: string,
    label: string,
    attestation: AnalyticsManualAttestation | undefined,
): AnalyticsComplianceCriterion {
    return attestation
        ? criterion(id, label, attestation.status, attestation.evidence, undefined, "manual")
        : criterion(
              id,
              label,
              "manual-review",
              "No manual attestation recorded.",
              "Complete and evidence this review.",
              "manual",
          );
}
