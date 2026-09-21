import type { Subject } from "@bernouy/cms-auth";
import { RequestScopedIdentityService } from "@bernouy/cms-identities/requestScope";
import { createSecretResolver, secretRefToKey } from "@bernouy/cms-secrets";
import {
    SourceOverlaySourceRepository,
    activeSourceObservability,
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
import type { ControlCmsOptions, ControlCmsState } from "cms-control/core/admin/control/types";
import type { CMS_ROLES } from "types/roles";

type ResolveSubject = (request: Request) => Promise<Subject<CMS_ROLES> | null>;

export type ControlSourceRequestScope = {
    deps: ExecutorDeps;
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
    const interceptEndpoint = configuration.sourceImageInterceptor;

    return {
        deps,
        overlaySources,
        proxiedSources: overlaySources,
        interceptEndpoint,
    };
}
