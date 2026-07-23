import {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    createSourceRequestTelemetryMiddleware,
    handleSourceRequest,
    sourcesPrefix,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import { executeAuthSystemSourceEndpoint } from "@bernouy/cms-auth";
import { executeFunctionSystemSourceEndpoint, SYSTEM_FUNCTIONS_SOURCE_URN } from "@bernouy/cms-functions";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { authorizeDeliverySourceEndpoint, resolveDeliverySubject } from "cms-delivery/core/sources/authorization";
import {
    createDeliverySourceRequestScope,
    deliverySourceOverlaySchemaCache,
    type DeliverySourceRequestScope,
} from "cms-delivery/core/sources/requestScope";

export function registerDeliverySourceProxy(delivery: DeliveryCms): void {
    const runner = delivery.runner;
    const schemaCache = deliverySourceOverlaySchemaCache(delivery);
    runner.group(
        CMS_SOURCES_ROUTE,
        (proxyRunner) => {
            const prefix = sourcesPrefix(runner.basePath);
            for (const method of SOURCE_PROXY_METHODS) {
                proxyRunner.setDefaultEndpoint(method, (request) => {
                    const scope = createDeliverySourceRequestScope(delivery, request, schemaCache);
                    const deps = {
                        ...scope.deps,
                        executeSystemEndpoint: (endpoint: SourceEndpoint, systemRequest: Request) =>
                            executeSystemEndpoint(delivery, scope, endpoint, systemRequest),
                        authorizeEndpoint: (endpoint: SourceEndpoint, sourceRequest: Request) =>
                            authorizeDeliverySourceEndpoint(delivery, endpoint, sourceRequest),
                        ...(scope.interceptEndpoint ? { interceptEndpoint: scope.interceptEndpoint } : {}),
                    };
                    return handleSourceRequest(scope.proxiedSources, request, {
                        prefix,
                        deps: { ...deps, telemetry: delivery.sourceTelemetry },
                    });
                });
            }
        },
        delivery.sourceTelemetry ? [createSourceRequestTelemetryMiddleware(delivery.sourceTelemetry)] : [],
    );
}

async function executeSystemEndpoint(
    delivery: DeliveryCms,
    scope: DeliverySourceRequestScope,
    endpoint: SourceEndpoint,
    request: Request,
): Promise<Response> {
    if (endpoint.urn.startsWith(`${SYSTEM_FUNCTIONS_SOURCE_URN}:`)) {
        if (!scope.functions || !scope.sources) {
            return new Response("function executor not configured", { status: 501 });
        }
        const subject = await resolveDeliverySubject(delivery, request);
        return executeFunctionSystemSourceEndpoint(endpoint, request, {
            functions: scope.functions,
            sources: scope.sources,
            deps: scope.deps,
            resolveUser: async () => (subject ? { id: subject.identifier, role: subject.role } : {}),
        });
    }
    if (delivery.auth) {
        return executeAuthSystemSourceEndpoint(delivery.auth, endpoint, request);
    }
    return new Response("system source executor not configured", { status: 501 });
}
