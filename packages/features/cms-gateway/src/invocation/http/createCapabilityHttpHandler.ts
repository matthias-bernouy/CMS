import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayActor, GatewayInvoker } from "cms-gateway/invocation/interfaces/Invocation";
import type { PageCapabilityAccess, PageExecutionPage } from "cms-gateway/execution/core/PageExecutionService";
import type { GatewayExecutionPin } from "cms-gateway/execution/interfaces/PageExecution";
import { gatewayRoutePrefix, CMS_CAPABILITY_CALL_ROUTE } from "./routes";
import { handleGatewayHttpCall } from "./handleHttpCall";

export type CapabilityHttpHandlerConfig = {
    siteId: string;
    basePath: string;
    invoker: GatewayInvoker;
    pageExecution?: PageExecutionHttpPort;
    resolveActor(request: Request): Promise<GatewayActor>;
    authenticateProvider?: (token: string) => Promise<string | null>;
};

export interface PageExecutionHttpPort {
    requiredAccess(page: PageExecutionPage, pageUrl: URL, callPrefix: string): Promise<PageCapabilityAccess | null>;
    authorizeCall(
        request: Request,
        basePath: string,
        contractId: string,
        capabilityId: string,
    ): Promise<GatewayExecutionPin>;
}

/** Create the complete provider/page capability HTTP adapter. */
export function createCapabilityHttpHandler(config: CapabilityHttpHandlerConfig) {
    return async (request: Request): Promise<Response> => {
        const installationId = await providerInstallation(config, request);
        if (installationId) {
            return handleGatewayHttpCall(request, {
                siteId: config.siteId,
                invoker: config.invoker,
                origin: "provider",
                actor: { kind: "provider", installationId },
                prefix: routePrefix(config.basePath),
            });
        }

        let execution;
        try {
            const identifiers = await capabilityIdentifiers(request, config);
            if (!config.pageExecution) {
                throw new GatewayError("not_authorized", "Page execution is unavailable");
            }
            execution = await config.pageExecution.authorizeCall(
                request,
                config.basePath,
                identifiers.contractId,
                identifiers.capabilityId,
            );
        } catch (error) {
            const code = error instanceof GatewayError ? error.code : "internal_error";
            const status = code === "not_authorized" ? 403 : code === "not_selected" ? 404 : 503;
            return Response.json({ error: { code } }, { status, headers: { "cache-control": "private, no-store" } });
        }
        return handleGatewayHttpCall(request, {
            siteId: config.siteId,
            invoker: config.invoker,
            origin: "page",
            actor: await config.resolveActor(request),
            execution,
            prefix: routePrefix(config.basePath),
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
    const route = await config.invoker.resolveHttp({
        siteId: config.siteId,
        contractId,
        method: request.method,
        path: separator < 0 ? "/" : suffix.slice(separator),
    });
    return { contractId, capabilityId: route.capability.id };
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
