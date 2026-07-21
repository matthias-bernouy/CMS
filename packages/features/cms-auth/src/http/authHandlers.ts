import type { LocalAuthentication } from "cms-auth/default-implementation/LocalAuthentication";
import type { OidcAuthentication } from "cms-auth/default-implementation/OidcAuthentication";
import type { IdentityProviderKind, IdentityProviderRepository } from "cms-auth/interfaces/IdentityProvider";
import { toLoginMethod } from "cms-auth/core/toLoginMethod";
import { privateAuthJsonResponse } from "cms-auth/http/authResponse";

export type AuthMethodsRoutesConfig = {
    /** Public auth prefix used in returned login URLs. Defaults to `basePath`. */
    publicBasePath?: string;
    identityProviders?: IdentityProviderRepository | null;
    supportedKinds?: readonly IdentityProviderKind[];
};

export const AUTH_ROUTES = {
    base: "/auth",
    login: "/login",
    logout: "/logout",
    oidcLogin: "/:provider/login",
    oidcCallback: "/:provider/callback",
    methods: "/methods",
} as const;

export function localLoginHandler<Role extends string>(
    local: LocalAuthentication<Role>,
    req: Request,
): Promise<Response> {
    return local.login(req);
}

export function localLogoutHandler<Role extends string>(local: LocalAuthentication<Role>, req: Request): Response {
    return local.logout(req);
}

export function oidcLoginHandler<Role extends string>(
    oidc: OidcAuthentication<Role>,
    req: Request,
): Promise<Response> | Response {
    return oidc.login(req);
}

export function oidcCallbackHandler<Role extends string>(
    oidc: OidcAuthentication<Role>,
    req: Request,
): Promise<Response> | Response {
    return oidc.callback(req);
}

export async function authMethodsHandler(cfg: AuthMethodsRoutesConfig): Promise<Response> {
    const providers = cfg.identityProviders ? await cfg.identityProviders.list() : [];
    const authBasePath = cfg.publicBasePath ?? AUTH_ROUTES.base;
    const supportedKinds = cfg.supportedKinds ? new Set(cfg.supportedKinds) : null;
    const methods = providers
        .filter((p) => p.enabled && (!supportedKinds || supportedKinds.has(p.kind)))
        .map((p) => toLoginMethod(p, authBasePath));
    return privateAuthJsonResponse(methods);
}
