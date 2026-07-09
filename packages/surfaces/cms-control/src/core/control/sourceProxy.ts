import {
    executeAuthSystemSourceEndpoint,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";
import {
    executeFunctionSystemSourceEndpoint,
    SYSTEM_FUNCTIONS_SOURCE_URN,
    withFunctionsSource,
} from "@bernouy/cms-functions";
import { ADMIN_ROLE, PUBLIC_ROLE, USER_ROLE, can, effectiveGrantsFor } from "@bernouy/cms-permissions";
import {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    SourceOverlaySourceRepository,
    handleSourceRequest,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    sourcesPrefix,
    type SourceEndpoint,
    type SourceEndpointAccessMode,
} from "@bernouy/cms-sources";
import { createTriggerInterceptor } from "@bernouy/cms-triggers";
import type { Middleware } from "@bernouy/http-runner";
import { createSecretResolver } from "@bernouy/cms-secrets";
import type { CMS_ROLES } from "types/roles";
import type { ControlCmsState } from "cms-control/core/control/types";

export function mountControlSourceProxy(
    state: ControlCmsState,
    authGuard: Middleware,
    controlPublicAuth: PublicAuthRoutesConfig<CMS_ROLES> | undefined,
): void {
    const runner = state.runner;
    const resolveSecret = createSecretResolver(state.secrets);
    const resolveContext = async (req: Request) => {
        const subject = await state.auth.getSubject(req).catch(() => null);
        return subject ? { userID: subject.identifier } : {};
    };
    const authorizeEndpoint = async (endpoint: SourceEndpoint, req: Request) => {
        const subject = await state.auth.getSubject(req).catch(() => null);
        if (!subject) return false;
        if (!sourceEndpointAccessAllows(
            sourceEndpointAccessMode(endpoint),
            controlCallerAccessMode(subject.role),
        )) {
            return false;
        }
        if (subject.role === ADMIN_ROLE) return true;
        const definitions = await state.roles.list();
        return can(effectiveGrantsFor(subject.role, { definitions }), endpoint.urn);
    };
    const sourceDeps = { resolveSecret, resolveContext };
    const overlaySources = state.sources && state.sourceOverlays
        ? new SourceOverlaySourceRepository(state.sources, state.sourceOverlays, { deps: sourceDeps })
        : state.sources;
    const proxiedSources = overlaySources && state.functions
        ? withFunctionsSource(overlaySources, state.functions)
        : overlaySources;
    const interceptEndpoint = state.triggers && state.functions && state.sources
        ? createTriggerInterceptor({
            triggers: state.triggers,
            functions: state.functions,
            sources: state.sources,
            deps: sourceDeps,
            resolveUser: async (req) => {
                const subject = await state.auth.getSubject(req).catch(() => null);
                return subject
                    ? { id: subject.identifier, role: subject.role }
                    : {};
            },
        })
        : undefined;
    const executeSystemEndpoint = async (endpoint: SourceEndpoint, req: Request) => {
        if (endpoint.urn.startsWith(`${SYSTEM_FUNCTIONS_SOURCE_URN}:`)) {
            if (!state.functions || !state.sources) {
                return new Response("function executor not configured", { status: 501 });
            }
            const subject = await state.auth.getSubject(req).catch(() => null);
            return executeFunctionSystemSourceEndpoint(endpoint, req, {
                functions: state.functions,
                sources: state.sources,
                deps: sourceDeps,
                resolveUser: async () => subject
                    ? { id: subject.identifier, role: subject.role }
                    : {},
            });
        }
        if (controlPublicAuth) return executeAuthSystemSourceEndpoint(controlPublicAuth, endpoint, req);
        return new Response("system source executor not configured", { status: 501 });
    };
    runner.group(CMS_SOURCES_ROUTE, (proxyRunner) => {
        const prefix = sourcesPrefix(runner.basePath);
        for (const method of SOURCE_PROXY_METHODS) {
            proxyRunner.setDefaultEndpoint(method, (req) =>
                handleSourceRequest(proxiedSources, req, {
                    prefix,
                    deps: {
                        resolveSecret,
                        resolveContext,
                        executeSystemEndpoint,
                        authorizeEndpoint,
                        ...(interceptEndpoint ? { interceptEndpoint } : {}),
                    },
                }));
        }
    }, [authGuard]);
}

function controlCallerAccessMode(roleId: string): SourceEndpointAccessMode {
    if (roleId === PUBLIC_ROLE) return "public";
    if (roleId === USER_ROLE) return "auth";
    return "admin";
}
