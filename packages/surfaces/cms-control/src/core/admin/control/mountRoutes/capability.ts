import { resolveRequestSubject } from "@bernouy/cms-auth";
import { GatewayError } from "@bernouy/cms-gateway";
import {
    CMS_CAPABILITY_CALL_ROUTE,
    gatewayRoutePrefix,
    handleGatewayHttpCall,
} from "@bernouy/cms-gateway/http/handlers";
import type { Middleware } from "@bernouy/http-runner";
import type { ControlCmsState } from "../types";
import { authorizeControlPageCall } from "./pages/execution";

export function mountControlCapabilityRoutes(state: ControlCmsState, guards: Middleware[]): void {
    if (!state.configuration.capabilityGateway) {
        return;
    }
    state.runner.group(
        CMS_CAPABILITY_CALL_ROUTE,
        (callRunner) => {
            for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"] as const) {
                callRunner.setDefaultEndpoint(method, (request) => handleControlCapabilityCall(request, state));
            }
        },
        guards,
    );
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
    let identifiers: { contractId: string; capabilityId: string };
    try {
        const target = capabilityTarget(request, state.runner.basePath);
        if (!target) {
            throw new GatewayError("invalid_input", "capability route is invalid");
        }
        const route = await configured.invoker.resolveHttp({
            siteId: configured.siteId,
            contractId: target.contractId,
            method: request.method,
            path: target.path,
        });
        identifiers = { contractId: target.contractId, capabilityId: route.capability.id };
    } catch (error) {
        const code = error instanceof GatewayError ? error.code : "internal_error";
        return Response.json({ error: { code } }, { status: code === "invalid_input" ? 400 : 404 });
    }
    let execution;
    try {
        execution = await authorizeControlPageCall(request, state, identifiers.contractId, identifiers.capabilityId);
    } catch (error) {
        const code = error instanceof GatewayError ? error.code : "internal_error";
        const status = code === "not_authorized" ? 403 : code === "not_selected" ? 404 : 503;
        return Response.json({ error: { code } }, { status, headers: { "cache-control": "private, no-store" } });
    }
    return handleGatewayHttpCall(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "page",
        actor: { kind: administrator ? "administrator" : "user", subjectId: subject.identifier },
        execution,
        prefix: gatewayRoutePrefix(state.runner.basePath, CMS_CAPABILITY_CALL_ROUTE),
    });
}

function capabilityTarget(request: Request, basePath: string): { contractId: string; path: string } | null {
    const prefix = gatewayRoutePrefix(basePath, CMS_CAPABILITY_CALL_ROUTE);
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(`${prefix}/`)) {
        return null;
    }
    const suffix = pathname.slice(prefix.length + 1);
    const separator = suffix.indexOf("/");
    const encodedContractId = separator < 0 ? suffix : suffix.slice(0, separator);
    try {
        const contractId = decodeURIComponent(encodedContractId);
        return contractId ? { contractId, path: separator < 0 ? "/" : suffix.slice(separator) } : null;
    } catch {
        return null;
    }
}
