import {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    handleSourceRequest,
    sourcesPrefix,
    type ExecutorDeps,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import { executeAuthSystemSourceEndpoint } from "@bernouy/cms-auth";
import {
    executeFunctionSystemSourceEndpoint,
    RequestScopedFunctionRepository,
    SYSTEM_FUNCTIONS_SOURCE_URN,
    withFunctionsSource,
    type FunctionRepository,
} from "@bernouy/cms-functions";
import { createTriggerInterceptor } from "@bernouy/cms-triggers";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import {
    authorizeDeliverySourceEndpoint,
    resolveDeliverySourceContext,
    resolveDeliverySubject,
} from "cms-delivery/core/sources/authorization";

export function registerDeliverySourceProxy(delivery: DeliveryCms): void {
    const runner = delivery.runner;
    runner.group(CMS_SOURCES_ROUTE, (proxyRunner) => {
        const prefix = sourcesPrefix(runner.basePath);
        const sourceDeps = {
            ...(delivery.sourceResolveSecret ? { resolveSecret: delivery.sourceResolveSecret } : {}),
            ...(delivery.identities ? { identities: delivery.identities } : {}),
            resolveContext: (request: Request) => resolveDeliverySourceContext(delivery, request),
        };
        const interceptEndpoint =
            delivery.triggers && delivery.functions && delivery.sources
                ? createTriggerInterceptor({
                      triggers: delivery.triggers,
                      functions: delivery.functions,
                      sources: delivery.sources,
                      deps: sourceDeps,
                      resolveUser: async (request) => {
                          const subject = await resolveDeliverySubject(delivery, request);
                          return subject ? { id: subject.identifier, role: subject.role } : {};
                      },
                  })
                : undefined;
        for (const method of SOURCE_PROXY_METHODS) {
            proxyRunner.setDefaultEndpoint(method, (request) => {
                const requestFunctions = delivery.functions
                    ? new RequestScopedFunctionRepository(delivery.functions)
                    : undefined;
                const proxiedSources =
                    delivery.sources && requestFunctions
                        ? withFunctionsSource(delivery.sources, requestFunctions)
                        : delivery.sources;
                const deps = {
                    ...sourceDeps,
                    executeSystemEndpoint: (endpoint: SourceEndpoint, systemRequest: Request) =>
                        executeSystemEndpoint(delivery, endpoint, systemRequest, sourceDeps, requestFunctions),
                    authorizeEndpoint: (endpoint: SourceEndpoint, sourceRequest: Request) =>
                        authorizeDeliverySourceEndpoint(delivery, endpoint, sourceRequest),
                    ...(interceptEndpoint ? { interceptEndpoint } : {}),
                };
                return handleSourceRequest(proxiedSources, request, { prefix, deps });
            });
        }
    });
}

async function executeSystemEndpoint(
    delivery: DeliveryCms,
    endpoint: SourceEndpoint,
    request: Request,
    sourceDeps: ExecutorDeps,
    functions: FunctionRepository | undefined,
): Promise<Response> {
    if (endpoint.urn.startsWith(`${SYSTEM_FUNCTIONS_SOURCE_URN}:`)) {
        if (!functions || !delivery.sources) {
            return new Response("function executor not configured", { status: 501 });
        }
        const subject = await resolveDeliverySubject(delivery, request);
        return executeFunctionSystemSourceEndpoint(endpoint, request, {
            functions,
            sources: delivery.sources,
            deps: sourceDeps,
            resolveUser: async () => (subject ? { id: subject.identifier, role: subject.role } : {}),
        });
    }
    if (delivery.auth) {
        return executeAuthSystemSourceEndpoint(delivery.auth, endpoint, request);
    }
    return new Response("system source executor not configured", { status: 501 });
}
