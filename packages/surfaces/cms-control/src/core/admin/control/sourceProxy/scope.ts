import type { Subject } from "@bernouy/cms-auth";
import { RequestScopedIdentityService } from "@bernouy/cms-identities/requestScope";
import { createSecretResolver, secretRefToKey } from "@bernouy/cms-secrets";
import {
    activeSourceObservability,
    type ExecutorDeps,
    type SourceEndpointInterceptor,
    type SourceRepository,
} from "@bernouy/cms-sources";
import {
    createRequestScopedSecretResolver,
    createRequestScopedSourceContextResolver,
    RequestScopedSourceRepository,
} from "@bernouy/cms-sources/requestScope";
import type { ControlCmsOptions, ControlCmsState } from "cms-control/core/admin/control/types";

type ResolveSubject = (request: Request) => Promise<Subject | null>;

export type ControlSourceRequestScope = {
    deps: ExecutorDeps;
    proxiedSources: SourceRepository | null;
    interceptEndpoint: SourceEndpointInterceptor | undefined;
};

export function createControlSourceRequestScope(
    state: ControlCmsState,
    configuration: ControlCmsOptions,
    request: Request,
    resolveSubject: ResolveSubject,
): ControlSourceRequestScope {
    const sources = state.sources ? new RequestScopedSourceRepository(state.sources) : null;
    const identities = state.identities ? new RequestScopedIdentityService(state.identities) : undefined;
    const observability = activeSourceObservability(request);
    const resolveContext = createRequestScopedSourceContextResolver(async (candidate) => {
        const subject = await resolveSubject(candidate);
        return subject ? { userID: subject.identifier } : {};
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
    };
    const interceptEndpoint = configuration.sourceImageInterceptor;

    return {
        deps,
        proxiedSources: sources,
        interceptEndpoint,
    };
}
