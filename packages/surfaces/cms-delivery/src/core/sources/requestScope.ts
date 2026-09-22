import { RequestScopedIdentityService } from "@bernouy/cms-identities/requestScope";
import { secretRefToKey } from "@bernouy/cms-secrets";
import {
    activeSourceObservability,
    composeSourceEndpointInterceptors,
    type ExecutorDeps,
    type SourceEndpointInterceptor,
    type SourceRepository,
} from "@bernouy/cms-sources";
import {
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

export function createDeliverySourceRequestScope(delivery: DeliveryCms, request: Request): DeliverySourceRequestScope {
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
        ...(activeSourceObservability(request) ? { observability: activeSourceObservability(request) } : {}),
    };
    const storedSources = delivery.sources ? new RequestScopedSourceRepository(delivery.sources) : undefined;
    const interceptEndpoint = composeSourceEndpointInterceptors(delivery.sourceImageInterceptor);

    return {
        proxiedSources: storedSources,
        deps,
        ...(interceptEndpoint ? { interceptEndpoint } : {}),
    };
}

function normalizeSecretReference(reference: string): string {
    return secretRefToKey(reference) ?? reference;
}
