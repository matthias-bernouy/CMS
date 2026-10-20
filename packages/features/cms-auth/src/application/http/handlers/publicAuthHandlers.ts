import type { Runner } from "@bernouy/http-runner";
import type { PublicAuthActions } from "cms-auth/application/interfaces/PublicAuthActions";
import { privateAuthJsonResponse } from "cms-auth/application/http/handlers/authResponse";
import { readJsonObject, requiredString } from "cms-auth/application/http/input/requestInput";

export const PUBLIC_AUTH_ROUTES = {
    base: "/.cms/auth",
    signup: "/signup",
    login: "/login",
    logout: "/logout",
    me: "/me",
    requestEmailVerification: "/email/verification/request",
    confirmEmailVerification: "/email/verification/confirm",
    requestPasswordReset: "/password/reset/request",
    confirmPasswordReset: "/password/reset/confirm",
} as const;

export type PublicAuthRoutesConfig = PublicAuthActions & { allowSignup?: boolean };

export type PublicAuthRouteOverrides = {
    signup?: (request: Request) => Response | Promise<Response>;
};

export function registerPublicAuthRoutes(
    runner: Runner,
    cfg: PublicAuthRoutesConfig,
    overrides: PublicAuthRouteOverrides = {},
): void {
    const actions = cfg;
    if (cfg.allowSignup !== false) {
        runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.signup, overrides.signup ?? ((req) => signup(req, actions)));
    }

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.login, (req) => actions.login(req));
    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.logout, () => actions.logout());
    runner.addEndpoint("GET", PUBLIC_AUTH_ROUTES.me, async (req) =>
        privateAuthJsonResponse({ subject: await actions.subject(req) }),
    );

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.requestEmailVerification, async (req) => {
        const body = await readJsonObject(req);
        await actions.requestEmailVerification({ email: requiredString(body, "email") });
        return ok();
    });

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.confirmEmailVerification, async (req) => {
        const body = await readJsonObject(req);
        await actions.confirmEmailVerification({ token: requiredString(body, "token") });
        return ok();
    });

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.requestPasswordReset, async (req) => {
        const body = await readJsonObject(req);
        await actions.requestPasswordReset({ email: requiredString(body, "email") });
        return ok();
    });

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.confirmPasswordReset, async (req) => {
        const body = await readJsonObject(req);
        await actions.confirmPasswordReset({
            token: requiredString(body, "token"),
            password: requiredString(body, "password"),
        });
        return ok();
    });
}

async function signup(req: Request, actions: PublicAuthActions): Promise<Response> {
    const body = await readJsonObject(req);
    await actions.signup({
        email: requiredString(body, "email"),
        password: requiredString(body, "password"),
    });
    return ok();
}

const ok = (): Response => privateAuthJsonResponse({ ok: true });
