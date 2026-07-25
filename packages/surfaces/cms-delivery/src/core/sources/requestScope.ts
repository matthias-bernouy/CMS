import { RequestScopedFunctionRepository, withFunctionsSource, type FunctionRepository } from "@bernouy/cms-functions";
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
import { createTriggerInterceptor } from "@bernouy/cms-triggers";
import { RequestScopedTriggerRepository } from "@bernouy/cms-triggers/requestScope";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { resolveDeliverySourceContext, resolveDeliverySubject } from "cms-delivery/core/sources/authorization";

export type DeliverySourceRequestScope = {
    sources: SourceRepository | undefined;
    proxiedSources: SourceRepository | undefined;
    functions: FunctionRepository | undefined;
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
    const functions = delivery.functions ? new RequestScopedFunctionRepository(delivery.functions) : undefined;
    const proxiedSources = sources && functions ? withFunctionsSource(sources, functions) : sources;
    const triggers = delivery.triggers ? new RequestScopedTriggerRepository(delivery.triggers) : undefined;
    const triggerInterceptor =
        triggers && functions && sources
            ? createTriggerInterceptor({
                  triggers,
                  functions,
                  sources,
                  deps,
                  resolveUser: async (candidate) => {
                      const subject = await resolveDeliverySubject(delivery, candidate);
                      return subject ? { id: subject.identifier, role: subject.role } : {};
                  },
              })
            : undefined;
    const interceptEndpoint = composeSourceEndpointInterceptors(triggerInterceptor, delivery.sourceImageInterceptor);

    return {
        sources,
        proxiedSources,
        functions,
        deps,
        ...(interceptEndpoint ? { interceptEndpoint } : {}),
    };
}

function normalizeSecretReference(reference: string): string {
    return secretRefToKey(reference) ?? reference;
}
