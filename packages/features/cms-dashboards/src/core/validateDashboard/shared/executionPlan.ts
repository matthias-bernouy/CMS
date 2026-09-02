import { makeEndpointUrn, makeSourceUrn, systemSourceUrnOf, type SourceRepository } from "@bernouy/cms-sources";
import type {
    DashboardAllowedCall,
    DashboardExecutionPlan,
    ResolvedDashboard,
    ResolvedDashboardView,
} from "../../../interfaces/Dashboard";

type EndpointReference = { sourceId: string; endpointId: string };

export async function compileDashboardExecutionPlan(
    dashboard: ResolvedDashboard,
    sources: SourceRepository,
): Promise<{ plan?: DashboardExecutionPlan; errors: string[] }> {
    if (dashboard.status !== "published") {
        return { errors: ["only a published dashboard can produce an execution plan"] };
    }
    const references: EndpointReference[] = [];
    dashboard.views.forEach((view) => collectViewReferences(view, references));
    const calls: DashboardAllowedCall[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const reference of references) {
        const source = await sources.getSource(makeSourceUrn(reference.sourceId));
        const endpoint = source?.endpoints.find(
            (candidate) => candidate.urn === makeEndpointUrn(reference.sourceId, reference.endpointId),
        );
        if (!source || !endpoint) {
            errors.push(`unknown endpoint "${reference.sourceId}/${reference.endpointId}"`);
            continue;
        }
        if (systemSourceUrnOf(source.urn) || (endpoint.access?.mode ?? "admin") === "system") {
            errors.push(`system endpoint "${reference.sourceId}/${reference.endpointId}" cannot be delegated`);
            continue;
        }
        const key = `${reference.sourceId}\u0000${reference.endpointId}\u0000${endpoint.method}`;
        if (!seen.has(key)) {
            calls.push({ sourceId: reference.sourceId, endpointId: reference.endpointId, method: endpoint.method });
            seen.add(key);
        }
    }
    if (errors.length) {
        return { errors };
    }
    calls.sort((left, right) =>
        `${left.sourceId}/${left.endpointId}/${left.method}`.localeCompare(
            `${right.sourceId}/${right.endpointId}/${right.method}`,
        ),
    );
    return {
        plan: { dashboardId: dashboard.id, revision: dashboard.revision, allowedCalls: calls },
        errors,
    };
}

function collectViewReferences(view: ResolvedDashboardView, output: EndpointReference[]): void {
    collectReferences(view.widgets, view.source, output);
    view.children.forEach((child) => collectViewReferences(child, output));
}

function collectReferences(value: unknown, defaultSource: string | undefined, output: EndpointReference[]): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectReferences(item, defaultSource, output));
        return;
    }
    if (!value || typeof value !== "object") {
        return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.endpoint === "string") {
        const sourceId = typeof record.sourceId === "string" ? record.sourceId : defaultSource;
        if (sourceId) {
            output.push({ sourceId, endpointId: record.endpoint });
        }
    }
    Object.values(record).forEach((child) => collectReferences(child, defaultSource, output));
}
