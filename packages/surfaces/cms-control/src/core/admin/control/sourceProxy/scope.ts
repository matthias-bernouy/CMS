import type { Subject } from "@bernouy/cms-auth";
import { RequestScopedFunctionRepository, withFunctionsSource, type FunctionRepository } from "@bernouy/cms-functions";
import { RequestScopedIdentityService } from "@bernouy/cms-identities/requestScope";
import { createSecretResolver, secretRefToKey } from "@bernouy/cms-secrets";
import {
    SourceOverlaySourceRepository,
    activeSourceObservability,
    composeSourceEndpointInterceptors,
    type ExecutorDeps,
    type SourceEndpointInterceptor,
    type SourceOverlaySchemaCache,
    type SourceRepository,
} from "@bernouy/cms-sources";
import {
    createRequestScopedSecretResolver,
    createRequestScopedSourceContextResolver,
    RequestScopedSourceOverlayRepository,
    RequestScopedSourceRepository,
} from "@bernouy/cms-sources/requestScope";
import { createTriggerInterceptor } from "@bernouy/cms-triggers";
import { RequestScopedTriggerRepository } from "@bernouy/cms-triggers/requestScope";
import type { ControlCmsOptions, ControlCmsState } from "cms-control/core/admin/control/types";
import type { CMS_ROLES } from "types/roles";

type ResolveSubject = (request: Request) => Promise<Subject<CMS_ROLES> | null>;

export type ControlSourceRequestScope = {
    deps: ExecutorDeps;
    functions: FunctionRepository | undefined;
    overlaySources: SourceRepository | null;
    proxiedSources: SourceRepository | null;
    interceptEndpoint: SourceEndpointInterceptor | undefined;
};

export function createControlSourceRequestScope(
    state: ControlCmsState,
    configuration: ControlCmsOptions,
    request: Request,
    resolveSubject: ResolveSubject,
    schemaCache: SourceOverlaySchemaCache | undefined,
): ControlSourceRequestScope {
    const sources = state.sources ? new RequestScopedSourceRepository(state.sources) : null;
    const overlays = state.sourceOverlays ? new RequestScopedSourceOverlayRepository(state.sourceOverlays) : undefined;
    const functions = state.functions ? new RequestScopedFunctionRepository(state.functions) : undefined;
    const triggers = state.triggers ? new RequestScopedTriggerRepository(state.triggers) : undefined;
    const identities = state.identities ? new RequestScopedIdentityService(state.identities) : undefined;
    const observability = activeSourceObservability(request);
    const resolveContext = createRequestScopedSourceContextResolver(async (candidate) => {
        const subject = await resolveSubject(candidate);
        return subject ? { userID: subject.identifier, userRole: subject.role } : {};
    });
    const resolveSecret = createRequestScopedSecretResolver(
        createSecretResolver(state.secrets),
        (reference) => secretRefToKey(reference) ?? reference,
    );
    const deps: ExecutorDeps = {
        resolveSecret,
        resolveContext,
        ...(identities ? { identities } : {}),
        ...(observability ? { observability } : {}),
        ...(configuration.sourceTrustedConnectorTarget
            ? { isTrustedConnectorTarget: configuration.sourceTrustedConnectorTarget }
            : {}),
    };
    const overlaySources =
        sources && overlays
            ? new SourceOverlaySourceRepository(sources, overlays, {
                  deps,
                  ...(schemaCache ? { schemaCache } : {}),
              })
            : sources;
    const proxiedSources =
        overlaySources && functions ? withFunctionsSource(overlaySources, functions) : overlaySources;
    const triggerInterceptor =
        triggers && functions && overlaySources
            ? createTriggerInterceptor({
                  triggers,
                  functions,
                  sources: overlaySources,
                  deps,
                  resolveUser: async (candidate) => {
                      const subject = await resolveSubject(candidate);
                      return subject ? { id: subject.identifier, role: subject.role } : {};
                  },
              })
            : undefined;
    const interceptEndpoint = composeSourceEndpointInterceptors(
        triggerInterceptor,
        configuration.sourceImageInterceptor,
    );

    return { deps, functions, overlaySources, proxiedSources, interceptEndpoint };
}
