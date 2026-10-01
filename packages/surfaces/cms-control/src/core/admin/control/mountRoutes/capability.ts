import { resolveRequestSubject } from "@bernouy/cms-auth";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { handleGatewayFileGet, handleGatewayImageGet } from "@bernouy/cms-gateway/media/handlers";
import type { Middleware } from "@bernouy/http-runner";
import { canReadDashboard } from "cms-control/core/admin/dashboards/access";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";
import type { ControlCms } from "cms-control/ControlCms";
import type { ControlCmsState } from "../types";

export function mountControlCapabilityRoutes(cms: ControlCms, state: ControlCmsState, guard: Middleware): void {
    if (!state.configuration.capabilityGateway) {
        return;
    }
    state.runner.group(
        "/api/call",
        (callRunner) => {
            callRunner.setDefaultEndpoint("POST", (request) => handleControlCapabilityCall(request, state));
        },
        [guard],
    );
    state.runner.group(
        "/api/dashboard-call",
        (callRunner) => {
            callRunner.setDefaultEndpoint("POST", (request) => handleDashboardCapabilityCall(request, cms, state));
        },
        [guard],
    );
    state.runner.group(
        "/api/media",
        (mediaRunner) => {
            mediaRunner.setDefaultEndpoint("GET", (request) => handleControlCapabilityFile(request, state));
        },
        [guard],
    );
    if (state.configuration.capabilityGateway.images) {
        state.runner.group(
            "/api/image",
            (imageRunner) => {
                imageRunner.setDefaultEndpoint("GET", (request) => handleControlCapabilityImage(request, state));
            },
            [guard],
        );
    }
}

export async function handleDashboardCapabilityCall(
    request: Request,
    cms: ControlCms,
    state: ControlCmsState,
): Promise<Response> {
    const configured = state.configuration.capabilityGateway;
    if (!configured) {
        return new Response(null, { status: 404 });
    }
    const subject = await resolveRequestSubject(state.auth, request).catch(() => null);
    if (!subject) {
        return Response.json({ error: { code: "not_authorized" } }, { status: 401 });
    }
    const dashboardId = new URL(request.url).searchParams.get("dashboardId");
    if (!dashboardId) {
        return Response.json({ error: { code: "invalid_input" } }, { status: 400 });
    }
    const dashboard = await dashboardFromCatalog(cms, dashboardId);
    if (!dashboard) {
        return Response.json({ error: { code: "dashboard_not_found" } }, { status: 404 });
    }
    let administrator: boolean;
    try {
        administrator = await configured.isAdministrator(subject);
    } catch {
        return Response.json({ error: { code: "grant_unavailable" } }, { status: 503 });
    }
    const assigned =
        administrator || (await state.dashboardAssignments.hasAssignment(subject.identifier, dashboard.id));
    if (!canReadDashboard(dashboard, administrator, assigned)) {
        return Response.json({ error: { code: "not_authorized" } }, { status: 403 });
    }
    const prefix = `${state.runner.basePath === "/" ? "" : state.runner.basePath}/api/dashboard-call`;
    const contractId = requestContractId(request, prefix);
    if (!contractId || !dashboard.sourceContracts?.includes(contractId)) {
        return Response.json({ error: { code: "contract_not_declared" } }, { status: 403 });
    }
    return handleGatewayHttpCall(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "view",
        actor: { kind: administrator ? "administrator" : "user", subjectId: subject.identifier },
        prefix,
    });
}

export async function handleControlCapabilityImage(request: Request, state: ControlCmsState): Promise<Response> {
    const configured = state.configuration.capabilityGateway;
    if (!configured?.images) {
        return new Response(null, { status: 404 });
    }
    const subject = await resolveRequestSubject(state.auth, request).catch(() => null);
    if (!subject) {
        return new Response(null, { status: 401 });
    }
    let administrator: boolean;
    try {
        administrator = await configured.isAdministrator(subject);
    } catch {
        return new Response(null, { status: 503 });
    }
    return handleGatewayImageGet(request, {
        siteId: configured.siteId,
        images: configured.images,
        origin: "control",
        actor: { kind: administrator ? "administrator" : "user", subjectId: subject.identifier },
        prefix: `${state.runner.basePath === "/" ? "" : state.runner.basePath}/api/image`,
    });
}

export async function handleControlCapabilityFile(request: Request, state: ControlCmsState): Promise<Response> {
    const configured = state.configuration.capabilityGateway;
    if (!configured) {
        return new Response(null, { status: 404 });
    }
    const subject = await resolveRequestSubject(state.auth, request).catch(() => null);
    if (!subject) {
        return new Response(null, { status: 401 });
    }
    let administrator: boolean;
    try {
        administrator = await configured.isAdministrator(subject);
    } catch {
        return new Response(null, { status: 503 });
    }
    return handleGatewayFileGet(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "control",
        actor: { kind: administrator ? "administrator" : "user", subjectId: subject.identifier },
        prefix: `${state.runner.basePath === "/" ? "" : state.runner.basePath}/api/media`,
    });
}

export async function handleControlCapabilityCall(request: Request, state: ControlCmsState): Promise<Response> {
    const configured = state.configuration.capabilityGateway;
    if (!configured) {
        return new Response(null, { status: 404 });
    }
    const subject = await resolveRequestSubject(state.auth, request).catch(() => null);
    if (!subject) {
        return Response.json({ error: { code: "not_authorized" } }, { status: 401 });
    }
    let administrator: boolean;
    try {
        administrator = await configured.isAdministrator(subject);
    } catch {
        return Response.json({ error: { code: "grant_unavailable" } }, { status: 503 });
    }
    return handleGatewayHttpCall(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "control",
        actor: { kind: administrator ? "administrator" : "user", subjectId: subject.identifier },
        prefix: `${state.runner.basePath === "/" ? "" : state.runner.basePath}/api/call`,
    });
}

function requestContractId(request: Request, prefix: string): string | null {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(`${prefix}/`)) {
        return null;
    }
    const [contract, capability, extra] = pathname.slice(prefix.length + 1).split("/");
    if (!contract || !capability || extra) {
        return null;
    }
    try {
        return decodeURIComponent(contract);
    } catch {
        return null;
    }
}
