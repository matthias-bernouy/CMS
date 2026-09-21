import { RequestScopedIdentityService } from "@bernouy/cms-identities/requestScope";
import { secretRefToKey } from "@bernouy/cms-secrets";
import {
    SourceOverlaySourceRepository,
    activeSourceObservability,
    composeSourceEndpointInterceptors,
    sourceOverlaySchemaCacheFor,
    type ExecutorDeps,
    type SourceEndpointInterceptor,
    type SourceOverlaySchemaCache,
    type SourceRepository,
} from "@bernouy/cms-sources";
import {
    RequestScopedSourceOverlayRepository,
    RequestScopedSourceRepository,
    createRequestScopedSecretResolver,
    createRequestScopedSourceContextResolver,
} from "@bernouy/cms-sources/requestScope";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { resolveDeliverySourceContext } from "cms-delivery/core/sources/authorization";

export type DeliverySourceRequestScope = {
    proxiedSources: SourceRepository | undefined;
    deps: ExecutorDeps;
    interceptEndpoint?: SourceEndpointInterceptor;
};

export function deliverySourceOverlaySchemaCache(delivery: DeliveryCms): SourceOverlaySchemaCache | undefined {
    return delivery.sourceOverlays ? sourceOverlaySchemaCacheFor(delivery.sourceOverlays) : undefined;
}

export function createDeliverySourceRequestScope(
    delivery: DeliveryCms,
    request: Request,
    schemaCache: SourceOverlaySchemaCache | undefined,
): DeliverySourceRequestScope {
    const identities = delivery.identities ? new RequestScopedIdentityService(delivery.identities) : undefined;
    const sourceResolveSecret = delivery.sourceResolveSecret;
    const resolveSecret = sourceResolveSecret
        ? createRequestScopedSecretResolver(
              (reference) => sourceResolveSecret(normalizeSecretReference(reference)),
              normalizeSecretReference,
          )
        : undefined;
    const deps: ExecutorDeps = {
        resolveContext: createRequestScopedSourceContextResolver((candidate) =>
            resolveDeliverySourceContext(delivery, candidate),
        ),
        ...(resolveSecret ? { resolveSecret } : {}),
        ...(identities ? { identities } : {}),
        ...(delivery.sourceTrustedConnectorTarget
            ? { isTrustedConnectorTarget: delivery.sourceTrustedConnectorTarget }
            : {}),
        ...(activeSourceObservability(request) ? { observability: activeSourceObservability(request) } : {}),
    };
    const storedSources = delivery.sources ? new RequestScopedSourceRepository(delivery.sources) : undefined;
    const requestOverlays = delivery.sourceOverlays
        ? new RequestScopedSourceOverlayRepository(delivery.sourceOverlays)
        : undefined;
    const sources =
        storedSources && requestOverlays
            ? new SourceOverlaySourceRepository(storedSources, requestOverlays, {
                  deps,
                  ...(schemaCache ? { schemaCache } : {}),
              })
            : storedSources;
    const interceptEndpoint = composeSourceEndpointInterceptors(delivery.sourceImageInterceptor);

    return {
        proxiedSources: sources,
        deps,
        ...(interceptEndpoint ? { interceptEndpoint } : {}),
    };
}

function normalizeSecretReference(reference: string): string {
    return secretRefToKey(reference) ?? reference;
}
