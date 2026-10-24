import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayActor } from "cms-gateway/invocation/interfaces/Invocation";
import { actorCredentialFromRequest } from "cms-gateway/protocol/TrustedCapabilityEffects";
import { gatewayFailureResponse, gatewayResultResponse } from "../handleHttpCall";
import { readGatewayHttpInput } from "../readHttpInput";
import { CMS_CAPABILITY_MUTATION_ROUTE, CMS_CAPABILITY_QUERY_ROUTE, gatewayRoutePrefix } from "../routes";
import type { CapabilityMutationHandlerConfig, CapabilityQueryHandlerConfig } from "./config";

/** Invoke one logical read capability without exposing its admitted HTTP binding to authored content. */
export function createCapabilityQueryHandler(config: CapabilityQueryHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        let actor: GatewayActor = { kind: "anonymous" };
        try {
            if (request.method !== "GET" && request.method !== "QUERY") {
                throw new GatewayError("invalid_route", "query transport accepts GET or QUERY only");
            }
            const { contractId, capabilityId } = logicalIdentifiers(
                request,
                config.basePath,
                CMS_CAPABILITY_QUERY_ROUTE,
            );
            const capability = await config.resolveCapability(contractId, capabilityId);
            assertLogicalCapability(capability, "query");
            if (request.method === "GET" && request.body) {
                throw new GatewayError("invalid_input", "GET queries cannot carry a request body");
            }
            const input = request.method === "GET" ? {} : await readStructuredInput(request, "query");
            if (capability.access !== "public") {
                actor = await config.resolveActor(request);
            }
            const result = await config.invoker.invoke({
                siteId: config.siteId,
                contractId,
                capabilityId,
                input,
                actor,
                ...(contractId === "ulvia.cms.access" && capabilityId === "resolve-actor"
                    ? { actorCredential: actorCredentialFromRequest(request) }
                    : {}),
            });
            return gatewayResultResponse(result, request.method);
        } catch (error) {
            return logicalFailure(error, actor);
        }
    };
}

/** Invoke one structured command by identity without exposing its admitted HTTP path to authored forms. */
export function createCapabilityMutationHandler(config: CapabilityMutationHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        let actor: GatewayActor = { kind: "anonymous" };
        try {
            if (request.method !== "POST") {
                throw new GatewayError("invalid_route", "mutation transport accepts POST only");
            }
            const { contractId, capabilityId } = logicalIdentifiers(
                request,
                config.basePath,
                CMS_CAPABILITY_MUTATION_ROUTE,
            );
            const capability = await config.resolveCapability(contractId, capabilityId);
            assertLogicalCapability(capability, "command");
            const input = await readStructuredInput(request, "mutation");
            if (capability.access !== "public") {
                actor = await config.resolveActor(request);
            }
            const idempotencyKey = mutationIdempotencyKey(request, capability.idempotency);
            const result = await config.invoker.invoke({
                siteId: config.siteId,
                contractId,
                capabilityId,
                input,
                actor,
                ...(idempotencyKey ? { idempotencyKey } : {}),
            });
            if (result.kind === "success") {
                notifyMutationSuccess(config, { contractId, capabilityId });
            }
            return gatewayResultResponse(result, request.method);
        } catch (error) {
            return logicalFailure(error, actor);
        }
    };
}

function notifyMutationSuccess(
    config: CapabilityMutationHandlerConfig,
    target: { readonly contractId: string; readonly capabilityId: string },
): void {
    try {
        config.onSuccess?.(target);
    } catch {
        // Cache invalidation observers must never replace a completed command response.
    }
}

type LogicalCapability = Awaited<ReturnType<CapabilityQueryHandlerConfig["resolveCapability"]>>;

function assertLogicalCapability(
    capability: LogicalCapability,
    expectedEffect: "query" | "command",
): asserts capability {
    if (!capability) {
        throw new GatewayError("not_selected", `${expectedEffect} capability is not selected`);
    }
    if (capability.effect !== expectedEffect) {
        throw new GatewayError(
            "invalid_route",
            `${expectedEffect} transport rejects ${capability.effect} capabilities`,
        );
    }
    if (capability.outputType === "binary") {
        throw new GatewayError("invalid_route", `declarative ${expectedEffect} calls require structured output`);
    }
}

async function readStructuredInput(request: Request, kind: "mutation" | "query"): Promise<Record<string, unknown>> {
    const input = await readGatewayHttpInput(request);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new GatewayError("invalid_input", `${kind} input must be a JSON object`);
    }
    return input as Record<string, unknown>;
}

function logicalIdentifiers(
    request: Request,
    basePath: string,
    route: string,
): { contractId: string; capabilityId: string } {
    const prefix = gatewayRoutePrefix(basePath || "/", route);
    const url = new URL(request.url);
    if (url.search) {
        throw new GatewayError("invalid_input", "logical capability transport does not accept URL parameters");
    }
    if (!url.pathname.startsWith(`${prefix}/`)) {
        throw new GatewayError("invalid_route", "logical capability route is invalid");
    }
    let identifiers: string[];
    try {
        identifiers = url.pathname
            .slice(prefix.length + 1)
            .split("/")
            .map(decodeURIComponent);
    } catch {
        throw new GatewayError("invalid_input", "capability identifiers are malformed");
    }
    const controlled = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
    if (identifiers.length !== 2 || identifiers.some((value) => !controlled.test(value))) {
        throw new GatewayError("invalid_input", "capability identifiers are invalid");
    }
    return { contractId: identifiers[0]!, capabilityId: identifiers[1]! };
}

function mutationIdempotencyKey(request: Request, mode: "none" | "natural" | "keyed" | undefined): string | undefined {
    if (mode !== "keyed") {
        return undefined;
    }
    const raw = request.headers.get("x-ulvia-automatic-idempotency-key");
    if (!raw || raw.length > 512 || !/^[\x21-\x7e]+$/u.test(raw)) {
        throw new GatewayError("invalid_input", "keyed commands require a valid idempotency key");
    }
    return raw;
}

function logicalFailure(error: unknown, actor: GatewayActor): Response {
    const code = error instanceof GatewayError ? error.code : "internal_error";
    const status =
        code === "invalid_input"
            ? 400
            : code === "not_authorized"
              ? actor.kind === "anonymous"
                  ? 401
                  : 403
              : code === "not_selected" || code === "invalid_route"
                ? 404
                : 503;
    return gatewayFailureResponse(code, status, error instanceof GatewayError ? error.requestId : undefined);
}
