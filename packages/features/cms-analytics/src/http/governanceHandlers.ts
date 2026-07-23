import { validateAnalyticsSettings } from "../core/governance/analyticsSettings";
import { ANALYTICS_CHECKLIST_VERSION, evaluateAnalyticsCompliance } from "../core/governance/evaluateCompliance";
import type {
    AnalyticsComplianceContext,
    AnalyticsManualAttestation,
    AnalyticsSettings,
} from "../interfaces/AnalyticsGovernance";
import type { AnalyticsStore } from "../interfaces/AnalyticsStore";
import { StrictAnalyticsReports } from "../core/reporting/StrictAnalyticsReports";

export const ANALYTICS_GOVERNANCE_ROUTES = {
    settings: "/analytics/settings",
    compliance: "/analytics/compliance",
    snapshots: "/analytics/compliance/snapshots",
} as const;

export async function analyticsSettingsHandler(store: AnalyticsStore): Promise<Response> {
    return Response.json(await store.getSettings());
}

export async function updateAnalyticsSettingsHandler(store: AnalyticsStore, req: Request): Promise<Response> {
    try {
        const input = await readObject(req);
        const settings = validateAnalyticsSettings({
            enabled: input.enabled,
            visitorEstimation: input.visitorEstimation,
            rollupRetentionDays: input.rollupRetentionDays,
            privacyNoticeUrl: input.privacyNoticeUrl,
        } as AnalyticsSettings);
        return Response.json(await store.updateSettings(settings));
    } catch (error) {
        return invalidRequest(error);
    }
}

export async function analyticsComplianceHandler(
    store: AnalyticsStore,
    context: AnalyticsComplianceContext,
): Promise<Response> {
    const [latest, settings, reporting] = await Promise.all([
        store.latestPublishedComplianceSnapshot(),
        store.getSettings(),
        new StrictAnalyticsReports(store).summary("24h"),
    ]);
    const evaluation = await evaluateAnalyticsCompliance(settings, context, latest?.manualAttestations);
    return Response.json({
        evaluation,
        reporting: reporting.meta,
        latestPublished: latest
            ? {
                  id: latest.id,
                  createdAt: latest.createdAt,
                  publishedAt: latest.publishedAt,
                  checklistVersion: latest.evaluation.checklistVersion,
                  configurationFingerprint: latest.evaluation.configurationFingerprint,
                  releaseReady: latest.evaluation.releaseReady,
                  stale: latest.evaluation.configurationFingerprint !== evaluation.configurationFingerprint,
              }
            : null,
        disclaimer:
            "This engineering self-assessment is not a CNIL certification or legal advice. The site owner remains responsible for the full service.",
    });
}

export async function createAnalyticsComplianceSnapshotHandler(
    store: AnalyticsStore,
    context: AnalyticsComplianceContext,
    req: Request,
): Promise<Response> {
    try {
        const input = await readObject(req);
        const manualAttestations = parseManualAttestations(input.manualAttestations);
        const now = new Date();
        const snapshot = {
            id: crypto.randomUUID(),
            createdAt: now,
            ...(input.publish === true ? { publishedAt: now } : {}),
            evaluation: await evaluateAnalyticsCompliance(await store.getSettings(), context, manualAttestations, now),
            manualAttestations,
        };
        await store.saveComplianceSnapshot(snapshot);
        return Response.json(snapshot, { status: 201 });
    } catch (error) {
        return invalidRequest(error);
    }
}

function parseManualAttestations(value: unknown): Record<string, AnalyticsManualAttestation> {
    if (!isObject(value)) {
        throw new Error("manualAttestations must be an object");
    }
    const result: Record<string, AnalyticsManualAttestation> = {};
    for (const [id, raw] of Object.entries(value)) {
        if (!isObject(raw)) {
            throw new Error(`manualAttestations.${id} must be an object`);
        }
        if (raw.status !== "pass" && raw.status !== "fail" && raw.status !== "not-applicable") {
            throw new Error(`manualAttestations.${id}.status is invalid`);
        }
        if (typeof raw.evidence !== "string" || !raw.evidence.trim() || raw.evidence.length > 2_000) {
            throw new Error(`manualAttestations.${id}.evidence must contain 1 to 2000 characters`);
        }
        result[id] = { status: raw.status, evidence: raw.evidence.trim() };
    }
    return result;
}

async function readObject(req: Request): Promise<Record<string, unknown>> {
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        throw new Error("content-type must be application/json");
    }
    const value: unknown = await req.json();
    if (!isObject(value)) {
        throw new Error("request body must be an object");
    }
    return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidRequest(error: unknown): Response {
    const message = error instanceof Error ? error.message : "invalid request";
    return Response.json({ error: message, checklistVersion: ANALYTICS_CHECKLIST_VERSION }, { status: 400 });
}
