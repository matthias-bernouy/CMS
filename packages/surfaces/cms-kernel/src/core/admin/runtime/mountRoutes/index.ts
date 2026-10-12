import {
    AUTH_ROUTES,
    PUBLIC_AUTH_ROUTES,
    authMethodsHandler,
    localLoginHandler,
    localLogoutHandler,
    oidcCallbackHandler,
    oidcLoginHandler,
    registerPublicAuthRoutes,
    resolveLoginMethods,
} from "@bernouy/cms-auth/http";
import { renderLoginPage } from "cms-kernel/core/admin/auth/authPages";
import type { AdminAuthBackends, KernelCmsState } from "cms-kernel/core/admin/runtime/types";

export function mountKernelCmsRoutes(state: KernelCmsState, authBackends: AdminAuthBackends): Promise<void> {
    const runner = state.runner;
    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    runner.addEndpoint("GET", "/login", async (req) => {
        const supportedKinds: ("local" | "oidc")[] = [];
        if (authBackends.local) {
            supportedKinds.push("local");
        }
        if (authBackends.oidc) {
            supportedKinds.push("oidc");
        }
        const methods = await resolveLoginMethods({
            publicBasePath: `${basePath}${AUTH_ROUTES.base}`,
            identityProviders: state.identityProviders,
            supportedKinds,
        });
        return renderLoginPage(req, basePath, methods);
    });

    if (state.configuration.publicAuth) {
        runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
            registerPublicAuthRoutes(authRunner, state.configuration.publicAuth!);
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
                publicBasePath: `${basePath}${AUTH_ROUTES.base}`,
                identityProviders: state.identityProviders,
                supportedKinds,
            }),
        );
    });

    return Promise.resolve();
}
