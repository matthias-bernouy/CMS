import { handleSourceRequest, sourcesPrefix, type SourceEndpoint } from "@bernouy/cms-sources";
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
        authorizeEndpoint: (endpoint: SourceEndpoint, sourceRequest: Request) =>
            authorizeDeliverySourceEndpoint(delivery, endpoint, sourceRequest),
        ...(scope.interceptEndpoint ? { interceptEndpoint: scope.interceptEndpoint } : {}),
    };
    return handleSourceRequest(scope.proxiedSources, request, {
        prefix: options.prefix ?? sourcesPrefix(delivery.runner.basePath),
        deps: { ...deps, telemetry: delivery.sourceTelemetry },
    });
}
