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
import { generateStyleEntry, P9R_CACHE } from "@bernouy/cms-content";
import { CMS_FILES_ROUTE, filesPrefix, serveFilesRequest } from "@bernouy/cms-files";
import { cachedResponseAsync, publicAssetCacheControl, redirect } from "@bernouy/http-runner";
import { renderLoginPage } from "cms-control/core/admin/auth/authPages";
import { mountControlSourceProxy } from "cms-control/core/admin/control/sourceProxy";
import {
    createAuthenticatedControlGuard,
    createControlAccessGuard,
    createControlStaticAccessGuard,
} from "cms-control/core/admin/control/adminAccess";
import type { ControlAuthBackends, ControlCmsState } from "cms-control/core/admin/control/types";
import { mountAnalyticsRoutes } from "cms-control/core/admin/control/mountRoutes/analytics";
import serveStaticFolder from "cms-control/core/admin/registerEndpoints/serveStaticFolder/serveStaticFolder";
import { serveApi } from "cms-control/core/admin/registerEndpoints/serveApiFolder";
import type { ControlCms } from "cms-control/ControlCms";
import { getInstalledIntegrationThemeContributions } from "cms-control/core/management/integrations/themeContributions";
import { mountDashboardOperatorRoutes } from "cms-control/core/admin/dashboards/operatorRoutes";
import { canAccessDashboardWorkspace } from "cms-control/core/admin/dashboards/access";
import { mountDashboardSourceProxy } from "cms-control/core/admin/dashboards/proxy";

export function mountControlCmsRoutes(
    cms: ControlCms,
    state: ControlCmsState,
    authBackends: ControlAuthBackends,
    apiDir: string,
): Promise<void> {
    const runner = state.runner;
    const authGuard = createControlAccessGuard(cms.basePath, state.auth);
    const authenticatedGuard = createAuthenticatedControlGuard(cms.basePath, state.auth);
    const staticGuard = createControlStaticAccessGuard(cms.basePath, state.auth, async (req) =>
        canAccessDashboardWorkspace(cms, req),
    );
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
    mountDashboardOperatorRoutes(cms, authenticatedGuard);
    mountDashboardSourceProxy(state, authenticatedGuard);
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
                async () =>
                    generateStyleEntry(
                        state.repository,
                        await getInstalledIntegrationThemeContributions(state.integrationInstallations),
                    ),
                publicAssetCacheControl(req),
            ),
        [authenticatedGuard],
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
        [staticGuard],
    );
    let apiRoutesReady = Promise.resolve();
    runner.group(
        "/api",
        (apiRunner) => {
            apiRoutesReady = serveApi(apiRunner, apiDir, cms);
            mountAnalyticsRoutes(apiRunner, state);
        },
        [authGuard],
    );
    return Promise.all([staticRoutesReady, apiRoutesReady]).then(() => undefined);
}
