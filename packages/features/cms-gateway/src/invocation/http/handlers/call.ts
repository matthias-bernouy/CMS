import { readTraceContext, TRACE_CONTEXT_HEADER } from "@bernouy/logging";
import { providerCredentialFingerprint } from "cms-gateway/access/providers/credentials";
import {
    DELEGATION_HEADER,
    PROVIDER_AUTHORITY_HEADER,
    validDelegationTicket,
} from "cms-gateway/access/delegation/wire";
import { resolveGatewayHttpRoute } from "../route/bindings";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayActor } from "cms-gateway/invocation/interfaces/Invocation";
import { actorCredentialFromRequest } from "cms-gateway/protocol/TrustedCapabilityEffects";
import { gatewayFailureResponse, handleGatewayHttpCall, observeFailure } from "../handleHttpCall";
import { CMS_CAPABILITY_CALL_ROUTE, gatewayRoutePrefix } from "../routes";
import type { CapabilityHttpHandlerConfig } from "./config";

/** Create the complete provider/browser capability HTTP adapter. */
export function createCapabilityHttpHandler(config: CapabilityHttpHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        const authority = request.headers.get(PROVIDER_AUTHORITY_HEADER);
        const ticket = request.headers.get(DELEGATION_HEADER);
        if (
            (authority !== null && authority !== "provider" && authority !== "delegated") ||
            (ticket !== null && authority !== "delegated") ||
            (authority === "delegated" && !validDelegationTicket(ticket))
        ) {
            return gatewayFailureResponse("not_authorized", 403);
        }
        if (authority === "provider" && config.invokeProvider) {
            const authorization = request.headers.get("authorization");
            if (!authorization?.startsWith("Bearer ") || !/^[\x21-\x7e]{32,4096}$/u.test(authorization.slice(7))) {
                return gatewayFailureResponse("not_authorized", 403);
            }
            const response = await handleGatewayHttpCall(request, {
                siteId: config.siteId,
                invoker: {
                    resolveContract: (value) => config.invoker.resolveContract(value),
                    invoke: (value) => config.invokeProvider!(authorization.slice(7), value),
                },
                actor: { kind: "anonymous" }, // Only the broker derives Provider authority.
                trace: readTraceContext(request.headers.get(TRACE_CONTEXT_HEADER)),
                prefix: routePrefix(config.basePath),
                onFailure: config.onFailure,
            });
            return response.status === 401
                ? new Response(response.body, { status: 403, headers: response.headers })
                : response;
        }
        const installationId = await providerInstallation(config, request);
        if (authority !== null && !installationId) {
            return gatewayFailureResponse("not_authorized", 403);
        }
        if (installationId) {
            return handleGatewayHttpCall(request, {
                siteId: config.siteId,
                invoker: config.invoker,
                actor: {
                    kind: "provider",
                    installationId,
                    credentialFingerprint: providerCredentialFingerprint(
                        request.headers.get("authorization")!.slice(7),
                    ),
                },
                trace: readTraceContext(request.headers.get(TRACE_CONTEXT_HEADER)),
                ...(ticket ? { delegationTicket: ticket } : {}),
                prefix: routePrefix(config.basePath),
                onFailure: config.onFailure,
            });
        }

        let actor: GatewayActor = { kind: "anonymous" };
        let actorCredential: ReturnType<typeof actorCredentialFromRequest>;
        try {
            const identifiers = await capabilityIdentifiers(request, config);
            if (identifiers.contractId === "ulvia.cms.access" && identifiers.route.capability.id === "resolve-actor") {
                actorCredential = actorCredentialFromRequest(request);
            }
            if (
                identifiers.route.capability.access !== "public" ||
                (identifiers.route.capability.output.type === "binary" && identifiers.route.capability.output.resource)
            ) {
                actor = await config.resolveActor(request);
            }
        } catch (error) {
            const code = error instanceof GatewayError ? error.code : "internal_error";
            const status =
                code === "invalid_input"
                    ? 400
                    : code === "not_authorized"
                      ? 403
                      : code === "not_selected" || code === "invalid_route"
                        ? 404
                        : 503;
            observeFailure(config.onFailure, { code, status, phase: "authorization" }, error);
            return gatewayFailureResponse(code, status);
        }
        return handleGatewayHttpCall(request, {
            siteId: config.siteId,
            invoker: config.invoker,
            actor,
            prefix: routePrefix(config.basePath),
            onFailure: config.onFailure,
            ...(actorCredential ? { actorCredential } : {}),
        });
    };
}

async function capabilityIdentifiers(request: Request, config: CapabilityHttpHandlerConfig) {
    const prefix = routePrefix(config.basePath);
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(`${prefix}/`)) {
        throw new GatewayError("invalid_input", "capability route is invalid");
    }
    const suffix = pathname.slice(prefix.length + 1);
    const separator = suffix.indexOf("/");
    const encodedContractId = separator < 0 ? suffix : suffix.slice(0, separator);
    let contractId: string;
    try {
        contractId = decodeURIComponent(encodedContractId);
    } catch {
        throw new GatewayError("invalid_input", "capability contract identifier is invalid");
    }
    const route = await resolveGatewayHttpRoute(config.invoker, {
        siteId: config.siteId,
        contractId,
        method: request.method,
        path: separator < 0 ? "/" : suffix.slice(separator),
    });
    return { contractId, route };
}

async function providerInstallation(config: CapabilityHttpHandlerConfig, request: Request): Promise<string | null> {
    const authorization = request.headers.get("authorization");
    if (!config.authenticateProvider || !authorization?.startsWith("Bearer ")) {
        return null;
    }
    return config.authenticateProvider(authorization.slice(7)).catch(() => null);
}

function routePrefix(basePath: string): string {
    return gatewayRoutePrefix(basePath || "/", CMS_CAPABILITY_CALL_ROUTE);
}
