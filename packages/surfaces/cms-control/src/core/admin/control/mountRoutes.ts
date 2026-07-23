import {
    AUTH_ROUTES,
    PUBLIC_AUTH_ROUTES,
    authMethodsHandler,
    localLoginHandler,
    localLogoutHandler,
    oidcCallbackHandler,
    oidcLoginHandler,
    registerPublicAuthRoutes,
} from "@bernouy/cms-auth";
import {
    ANALYTICS_ROUTES,
    StrictAnalyticsReports,
    analyticsBreakdownHandler,
    analyticsEntriesHandler,
    analyticsFlowsHandler,
    analyticsHealthHandler,
    analyticsReferrersHandler,
    analyticsSummaryHandler,
    analyticsTimeseriesHandler,
    analyticsTopPagesHandler,
} from "@bernouy/cms-analytics";
import { generateStyleEntry, P9R_CACHE } from "@bernouy/cms-content";
import { CMS_FILES_ROUTE, filesPrefix, serveFilesRequest } from "@bernouy/cms-files";
import { cachedResponseAsync, publicAssetCacheControl, redirect } from "@bernouy/http-runner";
import { renderLoginPage } from "cms-control/core/admin/auth/authPages";
import { mountControlSourceProxy } from "cms-control/core/admin/control/sourceProxy";
import { createControlAccessGuard } from "cms-control/core/admin/control/adminAccess";
import type { ControlAuthBackends, ControlCmsState } from "cms-control/core/admin/control/types";
import serveStaticFolder from "cms-control/core/admin/registerEndpoints/serveStaticFolder/serveStaticFolder";
import { serveApi } from "cms-control/core/admin/registerEndpoints/serveApiFolder";
import type { ControlCms } from "cms-control/ControlCms";

export function mountControlCmsRoutes(
    cms: ControlCms,
    state: ControlCmsState,
    authBackends: ControlAuthBackends,
    apiDir: string,
): Promise<void> {
    const runner = state.runner;
    const authGuard = createControlAccessGuard(cms.basePath, state.auth);
    runner.addEndpoint("GET", "/login", (req) => renderLoginPage(req, cms.basePath));

    const controlPublicAuth = state.configuration.publicAuth
        ? { ...state.configuration.publicAuth, allowSignup: false }
        : undefined;
    if (controlPublicAuth) {
        runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
            registerPublicAuthRoutes(authRunner, controlPublicAuth);
        });
    }

    runner.group(AUTH_ROUTES.base, (authRunner) => {
        const supportedKinds: ("local" | "oidc")[] = [];
        if (authBackends.local) {
            supportedKinds.push("local");
            authRunner.addEndpoint("POST", AUTH_ROUTES.login, (req) => localLoginHandler(authBackends.local!, req));
            authRunner.addEndpoint("GET", AUTH_ROUTES.logout, (req) => localLogoutHandler(authBackends.local!, req));
        }
        if (authBackends.oidc) {
            supportedKinds.push("oidc");
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcLogin, (req) => oidcLoginHandler(authBackends.oidc!, req));
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcCallback, (req) =>
                oidcCallbackHandler(authBackends.oidc!, req),
            );
        }
        authRunner.addEndpoint("GET", AUTH_ROUTES.methods, () =>
            authMethodsHandler({
                publicBasePath: `${cms.basePath}${AUTH_ROUTES.base}`,
                identityProviders: state.identityProviders,
                supportedKinds,
            }),
        );
    });

    const toPages = () => redirect(`${cms.basePath}/admin/pages`);
    runner.addEndpoint("GET", "/", toPages, [authGuard]);
    runner.addEndpoint("GET", "/admin", toPages, [authGuard]);
    mountControlSourceProxy(state, authGuard, controlPublicAuth);
    runner.group(
        CMS_FILES_ROUTE,
        (filesRunner) => {
            const prefix = filesPrefix(runner.basePath);
            filesRunner.setDefaultEndpoint("GET", (req) =>
                serveFilesRequest({ metadata: cms.filesMetadata, blob: cms.filesBlob }, req, { prefix }),
            );
        },
        [authGuard],
    );
    runner.addEndpoint(
        "GET",
        "/.cms/style",
        (req) =>
            cachedResponseAsync(
                req,
                P9R_CACHE.STYLE,
                state.cache,
                () => generateStyleEntry(state.repository),
                publicAssetCacheControl(req),
            ),
        [authGuard],
    );
    let staticRoutesReady = Promise.resolve();
    runner.group(
        "/",
        (staticRunner) => {
            staticRoutesReady = serveStaticFolder(staticRunner, {
                cache: state.cache,
                cspExtras: () => cms.getCspExtras(),
            });
        },
        [authGuard],
    );
    let apiRoutesReady = Promise.resolve();
    runner.group(
        "/api",
        (apiRunner) => {
            apiRoutesReady = serveApi(apiRunner, apiDir, cms);
            if (!state.analytics) {
                return;
            }
            const reports = new StrictAnalyticsReports(state.analytics);
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.summary, (req) => analyticsSummaryHandler(reports, req));
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.timeseries, (req) =>
                analyticsTimeseriesHandler(reports, req),
            );
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.topPages, (req) => analyticsTopPagesHandler(reports, req));
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.entries, (req) => analyticsEntriesHandler(reports, req));
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.breakdown, (req) => analyticsBreakdownHandler(reports, req));
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.referrers, (req) => analyticsReferrersHandler(reports, req));
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.flows, (req) => analyticsFlowsHandler(reports, req));
            apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.health, (req) => analyticsHealthHandler(reports, req));
        },
        [authGuard],
    );
    return Promise.all([staticRoutesReady, apiRoutesReady]).then(() => undefined);
}
