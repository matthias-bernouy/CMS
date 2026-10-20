import {
    AUTH_ROUTES,
    PUBLIC_AUTH_ROUTES,
    localLoginHandler,
    localLogoutHandler,
    registerPublicAuthRoutes,
} from "@bernouy/cms-auth/http";
import type KernelCms from "cms-kernel/KernelCms";

export function mountAuthRoutes(kernel: KernelCms): void {
    const { runner } = kernel;
    runner.group(PUBLIC_AUTH_ROUTES.base, (authRunner) => {
        if (kernel.publicAuth) {
            registerPublicAuthRoutes(authRunner, kernel.publicAuth!);
        }
    });

    runner.group(AUTH_ROUTES.base, (authRunner) => {
        if (kernel.localAuthentication) {
            authRunner.addEndpoint("POST", AUTH_ROUTES.login, (request) =>
                localLoginHandler(kernel.localAuthentication!, request),
            );
            authRunner.addEndpoint("GET", AUTH_ROUTES.logout, (request) =>
                localLogoutHandler(kernel.localAuthentication!, request),
            );
        }
    });
}
