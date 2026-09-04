import type { DashboardExecutionPlan } from "@bernouy/cms-dashboards";
import {
    SOURCE_PROXY_METHODS,
    handleSourceRequest,
    isSystemSourceUrn,
    makeSourceUrn,
    parseUrn,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import type { Middleware } from "@bernouy/http-runner";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { createControlSourceRequestScope } from "cms-control/core/admin/control/sourceProxy/scope";
import { canAccessDashboard } from "./access";
import { dashboardExecutionPlan } from "./runtime";

const ROUTE = "/.cms/dashboards";

export function mountDashboardSourceProxy(state: ControlCmsState, guard: Middleware): void {
    state.runner.group(
        ROUTE,
        (runner) => {
            for (const method of SOURCE_PROXY_METHODS) {
                runner.setDefaultEndpoint(method, async (req) => await executeScopedRequest(state, req));
            }
        },
        [guard],
    );
}

async function executeScopedRequest(state: ControlCmsState, request: Request): Promise<Response> {
    const subject = await state.auth.getSubject(request);
    const parsed = scopedPath(state.runner.basePath, request.url);
    if (!subject || !parsed || !(await canAccessDashboard(state, subject, parsed.dashboardId))) {
        return new Response("Forbidden", { status: 403 });
    }
    const dashboard = (await state.dashboards.getDashboard(parsed.dashboardId))!;
    const plan = await dashboardExecutionPlan(state, dashboard);
    if (!plan || plan.revision !== dashboard.revision) {
        return new Response("Dashboard execution plan unavailable", { status: 409 });
    }
    const scope = createControlSourceRequestScope(state, state.configuration, request, async () => subject, undefined);
    const response = await handleSourceRequest(scope.proxiedSources, request, {
        prefix: parsed.prefix,
        deps: {
            ...scope.deps,
            telemetry: state.configuration.sourceTelemetry,
            authorizeEndpoint: (endpoint) => allowed(plan, endpoint, request.method),
            ...(scope.interceptEndpoint ? { interceptEndpoint: scope.interceptEndpoint } : {}),
        },
    });
    if (response.ok && request.method !== "GET" && request.method !== "HEAD") {
        const endpoint = plan.allowedCalls.find(
            (call) => call.sourceId === parsed.sourceId && call.endpointId === parsed.endpointId,
        );
        console.info(
            JSON.stringify({
                scope: "dashboard-operation",
                actor: subject.identifier,
                dashboardId: dashboard.id,
                revision: dashboard.revision,
                sourceId: endpoint?.sourceId,
                endpointId: endpoint?.endpointId,
                method: request.method,
            }),
        );
    }
    return response;
}

function allowed(plan: DashboardExecutionPlan, endpoint: SourceEndpoint, method: string): boolean {
    const urn = parseUrn(endpoint.urn);
    if (!urn || endpoint.access?.mode === "system" || isSystemSourceUrn(makeSourceUrn(urn.source))) {
        return false;
    }
    return plan.allowedCalls.some(
        (call) =>
            call.sourceId === urn?.source && call.endpointId === urn?.endpoint && call.method === method.toUpperCase(),
    );
}

function scopedPath(basePath: string, requestUrl: string) {
    const base = basePath === "/" ? "" : basePath.replace(/\/$/, "");
    const path = new URL(requestUrl).pathname;
    const root = `${base}${ROUTE}/`;
    if (!path.startsWith(root)) {
        return null;
    }
    const rawSegments = path.slice(root.length).split("/");
    if (rawSegments.length !== 4 || rawSegments.some((segment) => !segment)) {
        return null;
    }
    let segments: string[];
    try {
        segments = rawSegments.map(decodeURIComponent);
    } catch {
        return null;
    }
    if (segments[1] !== "sources") {
        return null;
    }
    return {
        dashboardId: segments[0]!,
        sourceId: segments[2]!,
        endpointId: segments[3]!,
        prefix: `${root}${encodeURIComponent(segments[0]!)}/sources/`,
    };
}
