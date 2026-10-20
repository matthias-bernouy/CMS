export { localLoginHandler, localLogoutHandler } from "cms-auth/application/http/handlers/localAuthentication";

export const AUTH_ROUTES = {
    base: "/auth",
    login: "/login",
    logout: "/logout",
} as const;
