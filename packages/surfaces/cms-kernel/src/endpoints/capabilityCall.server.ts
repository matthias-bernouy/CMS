import { GatewayError, type GatewayActor } from "@bernouy/cms-gateway";
import {
    CMS_CAPABILITY_CALL_ROUTE,
    gatewayRoutePrefix,
    handleGatewayHttpCall,
} from "@bernouy/cms-gateway/http/handlers";
import type KernelCms from "cms-kernel/KernelCms";

export async function handleCapabilityCall(request: Request, kernel: KernelCms): Promise<Response> {
    const configured = kernel.capabilityGateway;
    if (!configured) {
        return new Response(null, { status: 404 });
    }
    const providerInstallationId = await providerActor(kernel, request);
    if (providerInstallationId) {
        return handleGatewayHttpCall(request, {
            siteId: configured.siteId,
            invoker: configured.invoker,
            origin: "provider",
            actor: { kind: "provider", installationId: providerInstallationId },
            prefix: gatewayRoutePrefix(kernel.runner.basePath, CMS_CAPABILITY_CALL_ROUTE),
        });
    }

    const actor = await pageActor(kernel, request);
    let execution;
    try {
        const identifiers = await capabilityIdentifiers(request, kernel);
        if (!kernel.pageExecution) {
            throw new GatewayError("not_authorized", "Page execution is unavailable");
        }
        execution = await kernel.pageExecution.authorizeCall(
            request,
            kernel.runner.basePath,
            identifiers.contractId,
            identifiers.capabilityId,
        );
    } catch (error) {
        const code = error instanceof GatewayError ? error.code : "internal_error";
        const status = code === "not_authorized" ? 403 : code === "not_selected" ? 404 : 503;
        return Response.json({ error: { code } }, { status, headers: { "cache-control": "private, no-store" } });
    }
    return handleGatewayHttpCall(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "page",
        actor,
        execution,
        prefix: gatewayRoutePrefix(kernel.runner.basePath, CMS_CAPABILITY_CALL_ROUTE),
    });
}

async function capabilityIdentifiers(
    request: Request,
    kernel: KernelCms,
): Promise<{ contractId: string; capabilityId: string }> {
    const prefix = gatewayRoutePrefix(kernel.runner.basePath, CMS_CAPABILITY_CALL_ROUTE);
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
    const route = await kernel.capabilityGateway!.invoker.resolveHttp({
        siteId: kernel.capabilityGateway!.siteId,
        contractId,
        method: request.method,
        path: separator < 0 ? "/" : suffix.slice(separator),
    });
    return { contractId, capabilityId: route.capability.id };
}

async function providerActor(kernel: KernelCms, request: Request): Promise<string | null> {
    const authenticate = kernel.capabilityGateway?.authenticateProvider;
    const authorization = request.headers.get("authorization");
    if (!authenticate || !authorization?.startsWith("Bearer ")) {
        return null;
    }
    return authenticate(authorization.slice(7)).catch(() => null);
}

async function pageActor(kernel: KernelCms, request: Request): Promise<GatewayActor> {
    const subject = await kernel.authentication.getSubject(request).catch(() => null);
    if (!subject) {
        return { kind: "anonymous" };
    }
    const administrator = await kernel.capabilityGateway?.isAdministrator(subject).catch(() => false);
    return {
        kind: administrator ? "administrator" : "user",
        subjectId: subject.identifier,
    };
}
