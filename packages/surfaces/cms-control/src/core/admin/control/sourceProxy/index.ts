import {
    executeAuthSystemSourceEndpoint,
    resolveRequestSubject,
    type PublicAuthRoutesConfig,
    type Subject,
} from "@bernouy/cms-auth";
import { executeSiteSystemSourceEndpoint } from "@bernouy/cms-content";
import {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    createSourceRequestTelemetryMiddleware,
    handleSourceRequest,
    measureActiveSourceTiming,
    sourceOverlaySchemaCacheFor,
    sourcesPrefix,
    SYSTEM_SITE_SOURCE_URN,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import type { Middleware } from "@bernouy/http-runner";
import { createControlSourceRequestScope } from "cms-control/core/admin/control/sourceProxy/scope";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

export function mountControlSourceProxy(
    state: ControlCmsState,
    authGuard: Middleware,
    controlPublicAuth: PublicAuthRoutesConfig | undefined,
): void {
    const runner = state.runner;
    const configuration = state.configuration ?? {};
    const schemaCache = state.sourceOverlays ? sourceOverlaySchemaCacheFor(state.sourceOverlays) : undefined;
    const resolveSubject = (request: Request): Promise<Subject | null> =>
        measureActiveSourceTiming(request, "cms_auth", () => resolveRequestSubject(state.auth, request)).catch(
            () => null,
        );
    const authorizeEndpoint = async (_endpoint: SourceEndpoint, req: Request) => {
        const subject = await resolveSubject(req);
        return Boolean(subject);
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
                        if (endpoint.urn.startsWith(`${SYSTEM_SITE_SOURCE_URN}:`)) {
                            return executeSiteSystemSourceEndpoint(state.repository, endpoint);
                        }
                        if (controlPublicAuth) {
                            return executeAuthSystemSourceEndpoint(controlPublicAuth, endpoint, request);
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
