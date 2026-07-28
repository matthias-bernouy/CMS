import { resolveRequestSubject } from "@bernouy/cms-auth";
import { injectAuthenticatedActor, readGatewayBody } from "./body";
import type { RepositoryManagementGatewayConfig, RepositoryManagementGatewayRequest } from "./contracts";
import { gatewayError, sanitizedGatewayResponse } from "./responses";

export type RepositoryManagementGatewayRoute = Readonly<{
    method: "GET" | "POST";
    path: string;
    body: "none" | "candidate" | "actor-json";
}>;

export type RepositoryManagementGatewayLimits = Readonly<{
    candidateBodyBytes: number;
    mutationBodyBytes: number;
    bodyReadTimeoutMs: number;
}>;

export async function handleRepositoryManagementGatewayRoute<Role extends string>(
    request: Request,
    route: RepositoryManagementGatewayRoute,
    config: RepositoryManagementGatewayConfig<Role>,
    limits: RepositoryManagementGatewayLimits,
): Promise<Response> {
    const subject = await resolveRequestSubject(config.authentication, request).catch(() => null);
    if (!subject || subject.role !== config.requiredRole || !validActor(subject.identifier)) {
        return gatewayError(403, "repository_management_forbidden", "Administrator access is required");
    }
    try {
        const forwarded = await gatewayRequest(request, route, subject.identifier, limits);
        return sanitizedGatewayResponse(await config.transport.forward(forwarded));
    } catch (error) {
        return gatewayFailure(error);
    }
}

async function gatewayRequest(
    request: Request,
    route: RepositoryManagementGatewayRoute,
    actor: string,
    limits: RepositoryManagementGatewayLimits,
): Promise<RepositoryManagementGatewayRequest> {
    const url = new URL(request.url);
    if (route.body === "none") {
        return { actor, method: route.method, path: route.path, query: url.search };
    }
    const limit = route.body === "candidate" ? limits.candidateBodyBytes : limits.mutationBodyBytes;
    const input = await readGatewayBody(request, limit, limits.bodyReadTimeoutMs);
    const body = route.body === "actor-json" ? injectAuthenticatedActor(input, actor, limit) : input;
    return {
        actor,
        method: route.method,
        path: route.path,
        query: url.search,
        contentType: request.headers.get("content-type") ?? "application/json",
        body,
    };
}

function gatewayFailure(error: unknown): Response {
    if (error && typeof error === "object" && "status" in error) {
        const status = (error as { status?: unknown }).status;
        if (status === 400 || status === 408 || status === 413) {
            const timeout = status === 408;
            return gatewayError(
                status,
                timeout
                    ? "repository_management_body_timeout"
                    : status === 413
                      ? "repository_management_too_large"
                      : "repository_management_invalid",
                timeout ? "Management request body timed out" : "Management request body is invalid",
            );
        }
    }
    return gatewayError(503, "repository_management_unavailable", "Repository management is unavailable");
}

function validActor(value: string): boolean {
    return (
        Boolean(value.trim()) &&
        value.length <= 512 &&
        !/[\u0000-\u001f\u007f]/u.test(value) &&
        !/[\uD800-\uDFFF]/u.test(value)
    );
}
