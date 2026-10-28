import type EdgeCms from "cms-edge/EdgeCms";
import {
    CMS_CAPABILITY_CALL_ROUTE,
    CMS_CAPABILITY_MUTATION_ROUTE,
    CMS_CAPABILITY_QUERY_ROUTE,
    createCapabilityHttpHandler,
    createCapabilityMutationHandler,
    createCapabilityQueryHandler,
} from "@bernouy/cms-gateway/http/handlers";
import { resolveRequestActor } from "cms-edge/http/auth/resolveRequestActor";
import { mountCmsMcpRoutes } from "cms-edge/http/mcp/routes";
import { applySessionEffect } from "cms-edge/http/session/applySessionEffect";
import { isEdgeReservedPath } from "./reservedPaths";

export function mountEdgeRoutes(edge: EdgeCms): void {
    const runner = edge.runner;
    if (edge.mcpHandler) {
        mountCmsMcpRoutes(runner, edge.mcpHandler);
    }
    if (edge.capabilityGateway || edge.capabilityHandler) {
        const capabilityHandler =
            edge.capabilityHandler ??
            createCapabilityHttpHandler({
                ...edge.capabilityGateway!,
                basePath: edge.basePath,
                resolveActor: (request) => resolveRequestActor(edge, request),
            });
        runner.group(CMS_CAPABILITY_CALL_ROUTE, (callRunner) => {
            for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT", "QUERY"] as const) {
                callRunner.setDefaultEndpoint(method, async (request) =>
                    applySessionEffect(await capabilityHandler(request), edge.sessionCookie),
                );
            }
        });
    }
    if (edge.queryHandler || edge.capabilityGateway?.resolveCapability) {
        const queryHandler =
            edge.queryHandler ??
            createCapabilityQueryHandler({
                ...edge.capabilityGateway!,
                resolveCapability: edge.capabilityGateway!.resolveCapability!,
                basePath: edge.basePath,
                resolveActor: (request) => resolveRequestActor(edge, request),
            });
        runner.group(CMS_CAPABILITY_QUERY_ROUTE, (queryRunner) => {
            queryRunner.setDefaultEndpoint("GET", async (request) =>
                applySessionEffect(await queryHandler(request), edge.sessionCookie),
            );
            queryRunner.setDefaultEndpoint("QUERY", async (request) =>
                applySessionEffect(await queryHandler(request), edge.sessionCookie),
            );
        });
    }
    if (edge.mutationHandler || edge.capabilityGateway?.resolveCapability) {
        const mutationHandler =
            edge.mutationHandler ??
            createCapabilityMutationHandler({
                ...edge.capabilityGateway!,
                resolveCapability: edge.capabilityGateway!.resolveCapability!,
                basePath: edge.basePath,
                resolveActor: (request) => resolveRequestActor(edge, request),
                onSuccess: edge.capabilityGateway!.onMutationSuccess,
            });
        runner.group(CMS_CAPABILITY_MUTATION_ROUTE, (mutationRunner) => {
            mutationRunner.setDefaultEndpoint("POST", async (request) =>
                applySessionEffect(await mutationHandler(request), edge.sessionCookie),
            );
        });
    }

    for (const method of ["GET", "HEAD"] as const) {
        runner.setDefaultEndpoint(method, async (request) => {
            const path = new URL(request.url).pathname.slice(edge.basePath.length) || "/";
            if (isEdgeReservedPath(path, "/.cms")) {
                return new Response(null, { status: 404 });
            }
            try {
                return await edge.resourceHandler(request, await resolveRequestActor(edge, request));
            } catch (error) {
                edge.logger.error("edge.resource.failed", {}, error);
                return new Response("Service unavailable", { status: 503, headers: { "cache-control": "no-store" } });
            }
        });
    }
}
