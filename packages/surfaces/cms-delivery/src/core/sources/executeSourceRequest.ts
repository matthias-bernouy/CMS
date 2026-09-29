import { handleSourceRequest, sourcesPrefix, SYSTEM_SITE_SOURCE_URN, type SourceEndpoint } from "@bernouy/cms-sources";
import { executeAuthSystemSourceEndpoint } from "@bernouy/cms-auth/http";
import { executeSiteSystemSourceEndpoint } from "@bernouy/cms-content/rendering";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { authorizeDeliverySourceEndpoint } from "cms-delivery/core/sources/authorization";
import { createDeliverySourceRequestScope } from "cms-delivery/core/sources/requestScope";

export function handleDeliverySourceRequest(
    delivery: DeliveryCms,
    request: Request,
    options: {
        prefix?: string;
    } = {},
): Promise<Response> {
    const scope = createDeliverySourceRequestScope(delivery, request);
    const deps = {
        ...scope.deps,
        executeSystemEndpoint: (endpoint: SourceEndpoint, systemRequest: Request) =>
            executeSystemEndpoint(delivery, endpoint, systemRequest),
        authorizeEndpoint: (endpoint: SourceEndpoint, sourceRequest: Request) =>
            authorizeDeliverySourceEndpoint(delivery, endpoint, sourceRequest),
        ...(scope.interceptEndpoint ? { interceptEndpoint: scope.interceptEndpoint } : {}),
    };
    return handleSourceRequest(scope.proxiedSources, request, {
        prefix: options.prefix ?? sourcesPrefix(delivery.runner.basePath),
        deps: { ...deps, telemetry: delivery.sourceTelemetry },
    });
}

async function executeSystemEndpoint(
    delivery: DeliveryCms,
    endpoint: SourceEndpoint,
    request: Request,
): Promise<Response> {
    if (endpoint.urn.startsWith(`${SYSTEM_SITE_SOURCE_URN}:`)) {
        return executeSiteSystemSourceEndpoint(delivery.repository, endpoint);
    }
    if (delivery.auth) {
        return executeAuthSystemSourceEndpoint(delivery.auth, endpoint, request);
    }
    return new Response("system source executor not configured", { status: 501 });
}
