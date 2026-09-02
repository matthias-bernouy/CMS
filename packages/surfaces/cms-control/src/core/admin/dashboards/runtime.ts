import {
    compileDashboardExecutionPlan,
    resolveDashboardViews,
    type DashboardDefinition,
    type DashboardExecutionPlan,
} from "@bernouy/cms-dashboards";
import { makeSourceUrn, parseUrn, sourceToDto, type SourceRepository } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";

type DashboardRuntime = Pick<ControlCms, "dashboards" | "dashboardViews"> & {
    sources: SourceRepository | null;
};

export async function dashboardExecutionPlan(
    runtime: DashboardRuntime,
    dashboard: DashboardDefinition,
): Promise<DashboardExecutionPlan | null> {
    if (dashboard.executionPlan?.revision === dashboard.revision) {
        return dashboard.executionPlan;
    }
    const resolved = resolveDashboardViews(dashboard, await runtime.dashboardViews.getAllViews());
    if (!resolved.dashboard || resolved.errors.length || !runtime.sources) {
        return null;
    }
    return (await compileDashboardExecutionPlan(resolved.dashboard, runtime.sources)).plan ?? null;
}

export async function operatorSourceGroups(runtime: DashboardRuntime, plan: DashboardExecutionPlan) {
    if (!runtime.sources) {
        return [];
    }
    const callsBySource = new Map<string, DashboardExecutionPlan["allowedCalls"]>();
    for (const call of plan.allowedCalls) {
        const calls = callsBySource.get(call.sourceId) ?? [];
        calls.push(call);
        callsBySource.set(call.sourceId, calls);
    }
    const groups = [];
    for (const [sourceId, calls] of callsBySource) {
        const source = await runtime.sources.getSource(makeSourceUrn(sourceId));
        if (!source) {
            continue;
        }
        const allowed = new Set(calls.map((call) => `${call.endpointId}\u0000${call.method}`));
        const endpoints = sourceToDto(source).endpoints.flatMap((endpoint) => {
            if (!allowed.has(`${endpoint.endpointId}\u0000${endpoint.method}`)) {
                return [];
            }
            const { headers: _headers, targetUrl: _targetUrl, access: _access, ...descriptor } = endpoint;
            return [{ ...descriptor, targetUrl: "" }];
        });
        groups.push({
            source: {
                urn: source.urn,
                id: parseUrn(source.urn)?.source ?? sourceId,
                name: source.meta?.name ?? sourceId,
                ...(source.meta?.icon ? { icon: source.meta.icon } : {}),
                ...(source.meta?.svg ? { svg: source.meta.svg } : {}),
                endpointCount: endpoints.length,
                dashboardCount: 0,
                readonly: false,
            },
            endpoints,
            dashboards: [],
        });
    }
    return groups;
}
