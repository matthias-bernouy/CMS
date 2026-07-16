import type { Runner } from "@bernouy/http-runner";
import type { LocalAuthentication } from "cms-auth/default-implementation/LocalAuthentication";
import type { PublicAuthFlowConfig } from "cms-auth/core/publicAuth";
import {
    confirmEmailVerification,
    confirmPasswordReset,
    requestEmailVerification,
    requestPasswordReset,
    signupLocalUser,
} from "cms-auth/core/publicAuth";
import { AuthValidationError } from "cms-auth/core/validation";
import { privateAuthJsonResponse } from "cms-auth/http/authResponse";

export const PUBLIC_AUTH_ROUTES = {
    base:                     "/.cms/auth",
    signup:                   "/signup",
    login:                    "/login",
    logout:                   "/logout",
    me:                       "/me",
    requestEmailVerification: "/email/verification/request",
    confirmEmailVerification: "/email/verification/confirm",
    requestPasswordReset:     "/password/reset/request",
    confirmPasswordReset:     "/password/reset/confirm",
} as const;

export type PublicAuthRoutesConfig<Role extends string = string> =
    PublicAuthFlowConfig<Role> & {
        local: LocalAuthentication<Role>;
        allowSignup?: boolean;
    };

export function registerPublicAuthRoutes<Role extends string>(
    runner: Runner,
    cfg: PublicAuthRoutesConfig<Role>,
): void {
    if (cfg.allowSignup !== false) {
        runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.signup, async (req) => {
            const body = await readJsonObject(req);
            await signupLocalUser(cfg, {
                email: requiredString(body, "email"),
                password: requiredString(body, "password"),
            });
            return ok();
        });
    }

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.login, (req) => cfg.local.loginJson(req));
    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.logout, () => cfg.local.logoutJson());
    runner.addEndpoint("GET", PUBLIC_AUTH_ROUTES.me, async (req) => privateAuthJsonResponse({ subject: await cfg.local.getSubject(req) }));

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.requestEmailVerification, async (req) => {
        const body = await readJsonObject(req);
        await requestEmailVerification(cfg, { email: requiredString(body, "email") });
        return ok();
    });

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.confirmEmailVerification, async (req) => {
        const body = await readJsonObject(req);
        await confirmEmailVerification(cfg, { token: requiredString(body, "token") });
        return ok();
    });

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.requestPasswordReset, async (req) => {
        const body = await readJsonObject(req);
        await requestPasswordReset(cfg, { email: requiredString(body, "email") });
        return ok();
    });

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.confirmPasswordReset, async (req) => {
        const body = await readJsonObject(req);
        await confirmPasswordReset(cfg, {
            token: requiredString(body, "token"),
            password: requiredString(body, "password"),
        });
        return ok();
    });
}

async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AuthValidationError("body", "object expected");
    }
    return body as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string): string {
    const value = body[field];
    if (typeof value !== "string" || !value) throw new AuthValidationError(field, "required");
    return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
    const value = body[field];
    return typeof value === "string" && value ? value : undefined;
}

const ok = (): Response => privateAuthJsonResponse({ ok: true });
