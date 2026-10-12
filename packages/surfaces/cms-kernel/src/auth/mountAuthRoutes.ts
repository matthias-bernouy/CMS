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
import type KernelCms from "cms-kernel/KernelCms";
import { renderLoginPage } from "cms-kernel/auth/loginPage";

export function mountAuthRoutes(kernel: KernelCms): void {
    const { runner } = kernel;
    const backends = kernel.authBackends ?? {};
    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    runner.addEndpoint("GET", "/login", async (request) => {
        const supportedKinds = authKinds(backends);
        const methods = await resolveLoginMethods({
            publicBasePath: `${basePath}${AUTH_ROUTES.base}`,
            identityProviders: kernel.identityProviders ?? null,
            supportedKinds,
        });
        return renderLoginPage(request, basePath, methods);
    });

    if (kernel.publicAuth) {
        runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
            registerPublicAuthRoutes(authRunner, kernel.publicAuth!);
        });
    }

    runner.group(AUTH_ROUTES.base, (authRunner) => {
        const supportedKinds = authKinds(backends);
        if (backends.local) {
            authRunner.addEndpoint("POST", AUTH_ROUTES.login, (request) => localLoginHandler(backends.local!, request));
            authRunner.addEndpoint("GET", AUTH_ROUTES.logout, (request) =>
                localLogoutHandler(backends.local!, request),
            );
        }
        if (backends.oidc) {
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcLogin, (request) =>
                oidcLoginHandler(backends.oidc!, request),
            );
            authRunner.addEndpoint("GET", AUTH_ROUTES.oidcCallback, (request) =>
                oidcCallbackHandler(backends.oidc!, request),
            );
        }
        authRunner.addEndpoint("GET", AUTH_ROUTES.methods, () =>
            authMethodsHandler({
                publicBasePath: `${basePath}${AUTH_ROUTES.base}`,
                identityProviders: kernel.identityProviders ?? null,
                supportedKinds,
            }),
        );
    });
}

function authKinds(backends: NonNullable<KernelCms["authBackends"]>): ("local" | "oidc")[] {
    return [...(backends.local ? (["local"] as const) : []), ...(backends.oidc ? (["oidc"] as const) : [])];
}
