import type {
    AnalyticsComplianceCriterion,
    AnalyticsManualAttestation,
    AnalyticsSettings,
    AnalyticsReportMetadata,
} from "@bernouy/cms-analytics";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

export type AnalyticsComplianceView = {
    evaluation: {
        evaluatedAt: string;
        checklistVersion: string;
        releaseReady: boolean;
        criteria: AnalyticsComplianceCriterion[];
    };
    latestPublished: null | {
        id: string;
        publishedAt: string;
        releaseReady: boolean;
        stale: boolean;
    };
    disclaimer: string;
    reporting: Omit<AnalyticsReportMetadata, "from" | "to" | "lastClosedBucket"> & {
        from: string;
        to: string;
        lastClosedBucket: string;
    };
};

export async function loadAnalyticsGovernance(signal?: AbortSignal) {
    return Promise.all([
        requestJson<AnalyticsSettings>("analytics/settings", { signal }),
        requestJson<AnalyticsComplianceView>("analytics/compliance", { signal }),
    ]);
}

export function saveAnalyticsSettings(settings: AnalyticsSettings) {
    return requestJson<AnalyticsSettings>("analytics/settings", {
        method: "POST",
        body: JSON.stringify(settings),
    });
}

export function saveComplianceSnapshot(
    manualAttestations: Record<string, AnalyticsManualAttestation>,
    publish: boolean,
) {
    return requestJson("analytics/compliance/snapshots", {
        method: "POST",
        body: JSON.stringify({ manualAttestations, publish }),
    });
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${getMetaBasePath()}/api/${path}`, {
        ...init,
        headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed with status ${response.status}`);
    }
    return response.json() as Promise<T>;
}
