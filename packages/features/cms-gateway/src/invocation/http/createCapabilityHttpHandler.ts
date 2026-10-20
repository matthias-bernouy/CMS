import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayActor, GatewayInvoker } from "cms-gateway/invocation/interfaces/Invocation";
import { gatewayRoutePrefix, CMS_CAPABILITY_CALL_ROUTE, CMS_CAPABILITY_QUERY_ROUTE } from "./routes";
import {
    gatewayFailureResponse,
    gatewayResultResponse,
    handleGatewayHttpCall,
    observeFailure,
    type GatewayHttpFailureObserver,
} from "./handleHttpCall";
import { readGatewayHttpInput } from "./readHttpInput";

export type CapabilityHttpHandlerConfig = {
    siteId: string;
    basePath: string;
    invoker: GatewayInvoker;
    resolveActor(request: Request): Promise<GatewayActor>;
    authenticateProvider?: (token: string) => Promise<string | null>;
    onFailure?: GatewayHttpFailureObserver;
};

export type CapabilityQueryHandlerConfig = Omit<CapabilityHttpHandlerConfig, "authenticateProvider"> & {
    resolveCapability(
        contractId: string,
        capabilityId: string,
    ): Promise<{
        readonly access: "public" | "authenticated" | "admin";
        readonly effect: "query" | "command";
        readonly outputType: string;
    } | null>;
};

/** Create the complete provider/page capability HTTP adapter. */
export function createCapabilityHttpHandler(config: CapabilityHttpHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        const installationId = await providerInstallation(config, request);
        if (installationId) {
            return handleGatewayHttpCall(request, {
                siteId: config.siteId,
                invoker: config.invoker,
                actor: { kind: "provider", installationId },
                prefix: routePrefix(config.basePath),
                onFailure: config.onFailure,
            });
        }

        let actor: GatewayActor = { kind: "anonymous" };
        try {
            const identifiers = await capabilityIdentifiers(request, config);
            if (identifiers.route.capability.access !== "public") {
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
        });
    };
}

/** Invoke one logical read capability without exposing its admitted HTTP binding to authored content. */
export function createCapabilityQueryHandler(config: CapabilityQueryHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        let actor: GatewayActor = { kind: "anonymous" };
        try {
            if (request.method !== "GET" && request.method !== "QUERY") {
                throw new GatewayError("invalid_route", "query transport accepts GET or QUERY only");
            }
            const { contractId, capabilityId } = queryIdentifiers(request, config.basePath);
            const capability = await config.resolveCapability(contractId, capabilityId);
            if (!capability) {
                throw new GatewayError("not_selected", "query capability is not selected");
            }
            if (capability.effect !== "query") {
                throw new GatewayError("invalid_route", "query transport rejects command capabilities");
            }
            if (capability.outputType === "binary") {
                throw new GatewayError("invalid_route", "declarative queries require structured output");
            }
            if (request.method === "GET" && request.body) {
                throw new GatewayError("invalid_input", "GET queries cannot carry a request body");
            }
            const input = request.method === "GET" ? {} : await readGatewayHttpInput(request);
            if (!input || typeof input !== "object" || Array.isArray(input)) {
                throw new GatewayError("invalid_input", "query input must be a JSON object");
            }
            if (capability.access !== "public") {
                actor = await config.resolveActor(request);
            }
            const result = await config.invoker.invoke({
                siteId: config.siteId,
                contractId,
                capabilityId,
                input,
                actor,
            });
            return gatewayResultResponse(result, request.method);
        } catch (error) {
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
    const route = await config.invoker.resolveHttp({
        siteId: config.siteId,
        contractId,
        method: request.method,
        path: separator < 0 ? "/" : suffix.slice(separator),
    });
    return { route };
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

function queryIdentifiers(request: Request, basePath: string): { contractId: string; capabilityId: string } {
    const prefix = gatewayRoutePrefix(basePath || "/", CMS_CAPABILITY_QUERY_ROUTE);
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (url.search) {
        throw new GatewayError("invalid_input", "query transport does not accept URL parameters");
    }
    if (!pathname.startsWith(`${prefix}/`)) {
        throw new GatewayError("invalid_route", "query route is invalid");
    }
    let identifiers: string[];
    try {
        identifiers = pathname
            .slice(prefix.length + 1)
            .split("/")
            .map(decodeURIComponent);
    } catch {
        throw new GatewayError("invalid_input", "query identifiers are malformed");
    }
    const controlled = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
    if (identifiers.length !== 2 || identifiers.some((value) => !controlled.test(value))) {
        throw new GatewayError("invalid_input", "query identifiers are invalid");
    }
    return { contractId: identifiers[0]!, capabilityId: identifiers[1]! };
}
