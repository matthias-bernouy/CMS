import {
    executeAuthSystemSourceEndpoint,
    resolveRequestSubject,
    type PublicAuthRoutesConfig,
    type Subject,
} from "@bernouy/cms-auth";
import { executeFunctionSystemSourceEndpoint, SYSTEM_FUNCTIONS_SOURCE_URN } from "@bernouy/cms-functions";
import { ADMIN_ROLE, PUBLIC_ROLE, USER_ROLE, can, effectiveGrantsFor } from "@bernouy/cms-permissions";
import { resolveRequestRoleDefinitions } from "@bernouy/cms-permissions/requestScope";
import {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    attachTriggerResponseBody,
    attachTriggerResponseFinalizer,
    createSourceRequestTelemetryMiddleware,
    handleSourceRequest,
    measureActiveSourceTiming,
    sourceOverlaySchemaCacheFor,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    sourcesPrefix,
    type SourceEndpoint,
    type SourceEndpointAccessMode,
} from "@bernouy/cms-sources";
import type { Middleware } from "@bernouy/http-runner";
import type { CMS_ROLES } from "types/roles";
import { createControlSourceRequestScope } from "cms-control/core/admin/control/sourceProxy/scope";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

export function mountControlSourceProxy(
    state: ControlCmsState,
    authGuard: Middleware,
    controlPublicAuth: PublicAuthRoutesConfig<CMS_ROLES> | undefined,
): void {
    const runner = state.runner;
    const configuration = state.configuration ?? {};
    const schemaCache = state.sourceOverlays ? sourceOverlaySchemaCacheFor(state.sourceOverlays) : undefined;
    const resolveSubject = (request: Request): Promise<Subject<CMS_ROLES> | null> =>
        measureActiveSourceTiming(request, "cms_auth", () => resolveRequestSubject(state.auth, request)).catch(
            () => null,
        );
    const authorizeEndpoint = async (endpoint: SourceEndpoint, req: Request) => {
        const subject = await resolveSubject(req);
        if (!subject) {
            return false;
        }
        if (!sourceEndpointAccessAllows(sourceEndpointAccessMode(endpoint), controlCallerAccessMode(subject.role))) {
            return false;
        }
        if (subject.role === ADMIN_ROLE) {
            return true;
        }
        const definitions = await measureActiveSourceTiming(req, "cms_roles", () =>
            resolveRequestRoleDefinitions(state.roles, req),
        );
        return can(effectiveGrantsFor(subject.role, { definitions }), endpoint.urn);
    };
    runner.group(
        CMS_SOURCES_ROUTE,
        (proxyRunner) => {
            const prefix = sourcesPrefix(runner.basePath);
            for (const method of SOURCE_PROXY_METHODS) {
                proxyRunner.setDefaultEndpoint(method, (req) => {
                    const scope = createControlSourceRequestScope(
                        state,
                        configuration,
                        req,
                        resolveSubject,
                        schemaCache,
                    );
                    const executeSystemEndpoint = async (endpoint: SourceEndpoint, request: Request) => {
                        if (endpoint.urn.startsWith(`${SYSTEM_FUNCTIONS_SOURCE_URN}:`)) {
                            if (!scope.functions || !scope.overlaySources) {
                                return new Response("function executor not configured", {
                                    status: 501,
                                });
                            }
                            const subject = await resolveSubject(request);
                            return executeFunctionSystemSourceEndpoint(endpoint, request, {
                                functions: scope.functions,
                                sources: scope.overlaySources,
                                deps: scope.deps,
                                resolveUser: async () =>
                                    subject ? { id: subject.identifier, role: subject.role } : {},
                            });
                        }
                        if (controlPublicAuth) {
                            return executeAuthSystemSourceEndpoint(controlPublicAuth, endpoint, request, {
                                attachTriggerResponseBody,
                                ...(scope.deferSystemResponseFinalization ? { attachTriggerResponseFinalizer } : {}),
                            });
                        }
                        return new Response("system source executor not configured", {
                            status: 501,
                        });
                    };
                    return handleSourceRequest(scope.proxiedSources, req, {
                        prefix,
                        deps: {
                            ...scope.deps,
                            telemetry: configuration.sourceTelemetry,
                            executeSystemEndpoint,
                            authorizeEndpoint,
                            ...(scope.interceptEndpoint ? { interceptEndpoint: scope.interceptEndpoint } : {}),
                        },
                    });
                });
            }
        },
        [
            ...(configuration.sourceTelemetry
                ? [createSourceRequestTelemetryMiddleware(configuration.sourceTelemetry)]
                : []),
            authGuard,
        ],
    );
}

function controlCallerAccessMode(roleId: string): SourceEndpointAccessMode {
    if (roleId === PUBLIC_ROLE) {
        return "public";
    }
    if (roleId === USER_ROLE) {
        return "auth";
    }
    return "admin";
}
