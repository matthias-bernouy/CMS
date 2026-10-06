import type { OidcAuthentication } from "cms-auth/application/core/authentication/OidcAuthentication";
import type {
    IdentityProviderKind,
    IdentityProviderRepository,
    LoginMethod,
} from "cms-auth/providers/interfaces/IdentityProvider";
import { toLoginMethod } from "cms-auth/providers/core/toLoginMethod";
import { privateAuthJsonResponse } from "cms-auth/application/http/handlers/authResponse";
export { localLoginHandler, localLogoutHandler } from "cms-auth/application/http/handlers/localAuthentication";

export type OidcAuthHandlers = Pick<OidcAuthentication, "login" | "callback">;

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

export function oidcLoginHandler(oidc: OidcAuthHandlers, req: Request): Promise<Response> | Response {
    return oidc.login(req);
}

export function oidcCallbackHandler(oidc: OidcAuthHandlers, req: Request): Promise<Response> | Response {
    return oidc.callback(req);
}

export async function authMethodsHandler(cfg: AuthMethodsRoutesConfig): Promise<Response> {
    return privateAuthJsonResponse(await resolveLoginMethods(cfg));
}

/** Resolve the public login choices once so HTTP and server-rendered login UIs share the same policy. */
export async function resolveLoginMethods(cfg: AuthMethodsRoutesConfig): Promise<LoginMethod[]> {
    const providers = cfg.identityProviders ? await cfg.identityProviders.list() : [];
    const authBasePath = cfg.publicBasePath ?? AUTH_ROUTES.base;
    const supportedKinds = cfg.supportedKinds ? new Set(cfg.supportedKinds) : null;
    return providers
        .filter((p) => p.enabled && (!supportedKinds || supportedKinds.has(p.kind)))
        .map((p) => toLoginMethod(p, authBasePath));
}
