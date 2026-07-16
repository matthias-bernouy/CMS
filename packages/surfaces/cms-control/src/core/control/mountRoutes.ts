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
    analyticsBreakdownHandler,
    analyticsSummaryHandler,
    analyticsTimeseriesHandler,
    analyticsTopPagesHandler,
} from "@bernouy/cms-analytics";
import { generateStyleEntry, P9R_CACHE } from "@bernouy/cms-content";
import { CMS_FILES_ROUTE, filesPrefix, serveFilesRequest } from "@bernouy/cms-files";
import { cachedResponseAsync, publicAssetCacheControl, redirect } from "@bernouy/http-runner";
import { renderLoginPage } from "cms-control/core/auth/authPages";
import { mountControlSourceProxy } from "cms-control/core/control/sourceProxy";
import { createControlAccessGuard } from "cms-control/core/control/operatorAccess";
import type { ControlAuthBackends, ControlCmsState } from "cms-control/core/control/types";
import serveStaticFolder from "cms-control/core/registerEndpoints/serveStaticFolder/serveStaticFolder";
import { serveApi } from "cms-control/core/registerEndpoints/serveApiFolder";
import type { ControlCms } from "cms-control/ControlCms";

export function mountControlCmsRoutes(
    cms: ControlCms,
    state: ControlCmsState,
    authBackends: ControlAuthBackends,
    apiDir: string,
): void {
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
            authRunner.addEndpoint("POST", AUTH_ROUTES.login, (req) =>
                localLoginHandler(authBackends.local!, req));
            authRunner.addEndpoint("GET", AUTH_ROUTES.logout, (req) =>
                localLogoutHandler(authBackends.local!, req));
        }
        if (authBackends.oidc) {
            supportedKinds.push("oidc");
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcLogin, (req) =>
                oidcLoginHandler(authBackends.oidc!, req));
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcCallback, (req) =>
                oidcCallbackHandler(authBackends.oidc!, req));
        }
        authRunner.addEndpoint("GET", AUTH_ROUTES.methods, () => authMethodsHandler({
            publicBasePath: `${cms.basePath}${AUTH_ROUTES.base}`,
            identityProviders: state.identityProviders,
            supportedKinds,
        }));
    });

    const toPages = () => redirect(`${cms.basePath}/admin/pages`);
    runner.addEndpoint("GET", "/", toPages, [authGuard]);
    runner.addEndpoint("GET", "/admin", toPages, [authGuard]);
    mountControlSourceProxy(state, authGuard, controlPublicAuth);
    runner.group(CMS_FILES_ROUTE, (filesRunner) => {
        const prefix = filesPrefix(runner.basePath);
        filesRunner.setDefaultEndpoint("GET", (req) =>
            serveFilesRequest(
                { metadata: cms.filesMetadata, blob: cms.filesBlob },
                req,
                { prefix },
            ));
    }, [authGuard]);
    runner.addEndpoint("GET", "/.cms/style", (req) => cachedResponseAsync(
        req,
        P9R_CACHE.STYLE,
        state.cache,
        () => generateStyleEntry(state.repository),
        publicAssetCacheControl(req),
    ), [authGuard]);
    runner.group("/", (staticRunner) => {
        serveStaticFolder(staticRunner, {
            cache: state.cache,
            cspExtras: () => cms.getCspExtras(),
        });
    }, [authGuard]);
    runner.group("/api", (apiRunner) => {
        serveApi(apiRunner, apiDir, cms);
        if (!state.analytics) return;
        const analytics = state.analytics;
        apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.summary, (req) =>
            analyticsSummaryHandler(analytics, req));
        apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.timeseries, (req) =>
            analyticsTimeseriesHandler(analytics, req));
        apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.topPages, (req) =>
            analyticsTopPagesHandler(analytics, req));
        apiRunner.addEndpoint("GET", ANALYTICS_ROUTES.breakdown, (req) =>
            analyticsBreakdownHandler(analytics, req));
    }, [authGuard]);
}
