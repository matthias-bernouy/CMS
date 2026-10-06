export {
    AUTH_ROUTES,
    localLoginHandler,
    localLogoutHandler,
    oidcLoginHandler,
    oidcCallbackHandler,
    authMethodsHandler,
    resolveLoginMethods,
    type AuthMethodsRoutesConfig,
    type OidcAuthHandlers,
} from "cms-auth/application/http/handlers/authHandlers";
export { createAuthGuard, type AuthGuardContext } from "cms-auth/application/http/handlers/authGuard";
export {
    PUBLIC_AUTH_ROUTES,
    registerPublicAuthRoutes,
    type PublicAuthRouteOverrides,
    type PublicAuthRoutesConfig,
} from "cms-auth/application/http/handlers/publicAuthHandlers";
