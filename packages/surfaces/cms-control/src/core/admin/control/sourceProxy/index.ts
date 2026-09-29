import { resolveRequestSubject, type Subject } from "@bernouy/cms-auth";
import {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    createSourceRequestTelemetryMiddleware,
    handleSourceRequest,
    measureActiveSourceTiming,
    sourcesPrefix,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import type { Middleware } from "@bernouy/http-runner";
import { createControlSourceRequestScope } from "cms-control/core/admin/control/sourceProxy/scope";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

export function mountControlSourceProxy(state: ControlCmsState, authGuard: Middleware): void {
    const runner = state.runner;
    const configuration = state.configuration ?? {};
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
                    const scope = createControlSourceRequestScope(state, configuration, req, resolveSubject);
                    return handleSourceRequest(scope.proxiedSources, req, {
                        prefix,
                        deps: {
                            ...scope.deps,
                            telemetry: configuration.sourceTelemetry,
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
