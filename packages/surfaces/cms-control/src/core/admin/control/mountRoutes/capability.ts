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
import type { ControlCmsState } from "../types";

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
    return handleGatewayHttpCall(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "control",
        actor: { kind: administrator ? "administrator" : "user", subjectId: subject.identifier },
        prefix: gatewayRoutePrefix(state.runner.basePath, CMS_CAPABILITY_CALL_ROUTE),
    });
}
