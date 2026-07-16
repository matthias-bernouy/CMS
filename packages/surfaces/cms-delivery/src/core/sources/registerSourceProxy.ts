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
    SYSTEM_FUNCTIONS_SOURCE_URN,
    withFunctionsSource,
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
    runner.group(CMS_SOURCES_ROUTE, proxyRunner => {
        const prefix = sourcesPrefix(runner.basePath);
        const sourceDeps = {
            ...(delivery.sourceResolveSecret ? { resolveSecret: delivery.sourceResolveSecret } : {}),
            ...(delivery.identities ? { identities: delivery.identities } : {}),
            resolveContext: (request: Request) => resolveDeliverySourceContext(delivery, request),
        };
        const proxiedSources = delivery.sources && delivery.functions
            ? withFunctionsSource(delivery.sources, delivery.functions)
            : delivery.sources;
        const interceptEndpoint = delivery.triggers && delivery.functions && delivery.sources
            ? createTriggerInterceptor({
                triggers: delivery.triggers,
                functions: delivery.functions,
                sources: delivery.sources,
                deps: sourceDeps,
                resolveUser: async request => {
                    const subject = await resolveDeliverySubject(delivery, request);
                    return subject ? { id: subject.identifier, role: subject.role } : {};
                },
            })
            : undefined;
        const deps = {
            ...sourceDeps,
            executeSystemEndpoint: (endpoint: SourceEndpoint, request: Request) =>
                executeSystemEndpoint(delivery, endpoint, request, sourceDeps),
            authorizeEndpoint: (endpoint: SourceEndpoint, request: Request) =>
                authorizeDeliverySourceEndpoint(delivery, endpoint, request),
            ...(interceptEndpoint ? { interceptEndpoint } : {}),
        };
        for (const method of SOURCE_PROXY_METHODS) {
            proxyRunner.setDefaultEndpoint(method, request =>
                handleSourceRequest(proxiedSources, request, { prefix, deps }));
        }
    });
}

async function executeSystemEndpoint(
    delivery: DeliveryCms,
    endpoint: SourceEndpoint,
    request: Request,
    sourceDeps: ExecutorDeps,
): Promise<Response> {
    if (endpoint.urn.startsWith(`${SYSTEM_FUNCTIONS_SOURCE_URN}:`)) {
        if (!delivery.functions || !delivery.sources) {
            return new Response("function executor not configured", { status: 501 });
        }
        const subject = await resolveDeliverySubject(delivery, request);
        return executeFunctionSystemSourceEndpoint(endpoint, request, {
            functions: delivery.functions,
            sources: delivery.sources,
            deps: sourceDeps,
            resolveUser: async () => subject ? { id: subject.identifier, role: subject.role } : {},
        });
    }
    if (delivery.auth) return executeAuthSystemSourceEndpoint(delivery.auth, endpoint, request);
    return new Response("system source executor not configured", { status: 501 });
}
