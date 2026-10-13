import {
    AUTH_ROUTES,
    PUBLIC_AUTH_ROUTES,
    authMethodsHandler,
    localLoginHandler,
    localLogoutHandler,
    oidcCallbackHandler,
    oidcLoginHandler,
    registerPublicAuthRoutes,
} from "@bernouy/cms-auth/http";
import type KernelCms from "cms-kernel/KernelCms";

export function mountAuthRoutes(kernel: KernelCms): void {
    const { runner } = kernel;
    const backends = kernel.authBackends ?? {};
    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
        if (kernel.publicAuth) {
            registerPublicAuthRoutes(authRunner, kernel.publicAuth!);
        }
        authRunner.addEndpoint("GET", PUBLIC_AUTH_ROUTES.methods, () =>
            authMethodsHandler({
                publicBasePath: `${basePath}${AUTH_ROUTES.base}`,
                identityProviders: kernel.identityProviders ?? null,
                supportedKinds: authKinds(backends),
            }),
        );
    });

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
    });
}

function authKinds(backends: NonNullable<KernelCms["authBackends"]>): ("local" | "oidc")[] {
    return [...(backends.local ? (["local"] as const) : []), ...(backends.oidc ? (["oidc"] as const) : [])];
}
