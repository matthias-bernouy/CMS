import { resolveRequestSubject } from "@bernouy/cms-auth";
import { handleGatewayFileGet, handleGatewayHttpCall } from "@bernouy/cms-gateway/handlers";
import type { Middleware } from "@bernouy/http-runner";
import type { ControlCmsState } from "../types";

export function mountControlCapabilityRoutes(state: ControlCmsState, guard: Middleware): void {
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
        "/api/media",
        (mediaRunner) => {
            mediaRunner.setDefaultEndpoint("GET", (request) => handleControlCapabilityFile(request, state));
        },
        [guard],
    );
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
