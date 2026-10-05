import { resolveRequestSubject } from "@bernouy/cms-auth";
import {
    CMS_CAPABILITY_CALL_ROUTE,
    CMS_CAPABILITY_IMAGE_ROUTE,
    CMS_CAPABILITY_MEDIA_ROUTE,
    gatewayRoutePrefix,
    handleGatewayHttpCall,
} from "@bernouy/cms-gateway/http/handlers";
import { handleGatewayFileGet, handleGatewayImageGet } from "@bernouy/cms-gateway/media/handlers";
import type { Middleware } from "@bernouy/http-runner";
import { GatewayError } from "@bernouy/cms-gateway";
import type { ControlCmsState } from "../types";
import { authorizeControlPageCall } from "./pages/execution";

export function mountControlCapabilityRoutes(state: ControlCmsState, guards: Middleware[]): void {
    if (!state.configuration.capabilityGateway) {
        return;
    }
    state.runner.group(
        CMS_CAPABILITY_CALL_ROUTE,
        (callRunner) => {
            callRunner.setDefaultEndpoint("POST", (request) => handleControlCapabilityCall(request, state));
        },
        guards,
    );
    state.runner.group(
        CMS_CAPABILITY_MEDIA_ROUTE,
        (mediaRunner) => {
            mediaRunner.setDefaultEndpoint("GET", (request) => handleControlCapabilityFile(request, state));
        },
        guards,
    );
    if (state.configuration.capabilityGateway.images) {
        state.runner.group(
            CMS_CAPABILITY_IMAGE_ROUTE,
            (imageRunner) => {
                imageRunner.setDefaultEndpoint("GET", (request) => handleControlCapabilityImage(request, state));
            },
            guards,
        );
    }
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
        prefix: gatewayRoutePrefix(state.runner.basePath, CMS_CAPABILITY_IMAGE_ROUTE),
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
        prefix: gatewayRoutePrefix(state.runner.basePath, CMS_CAPABILITY_MEDIA_ROUTE),
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
    const identifiers = capabilityIdentifiers(request, state.runner.basePath);
    if (!identifiers) {
        return Response.json({ error: { code: "invalid_input" } }, { status: 400 });
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

function capabilityIdentifiers(
    request: Request,
    basePath: string,
): { contractId: string; capabilityId: string } | null {
    const prefix = gatewayRoutePrefix(basePath, CMS_CAPABILITY_CALL_ROUTE);
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(`${prefix}/`)) {
        return null;
    }
    const parts = pathname.slice(prefix.length + 1).split("/");
    try {
        const [contractId, capabilityId] = parts.map(decodeURIComponent);
        return parts.length === 2 && contractId && capabilityId ? { contractId, capabilityId } : null;
    } catch {
        return null;
    }
}
