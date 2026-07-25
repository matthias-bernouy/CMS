import type { Runner } from "@bernouy/http-runner";
import type { LocalAuthentication } from "cms-auth/default-implementation/authentication/LocalAuthentication";
import type { PublicAuthFlowConfig } from "cms-auth/core/public-auth/flows";
import {
    confirmEmailVerification,
    confirmPasswordReset,
    requestEmailVerification,
    requestPasswordReset,
    signupLocalUser,
} from "cms-auth/core/public-auth/flows";
import { privateAuthJsonResponse } from "cms-auth/http/authResponse";
import { optionalRepeatedStrings, readJsonObject, requiredString } from "cms-auth/http/requestInput";
import { resolveRequestSubject } from "cms-auth/http/requestSubject";
import type { SignupLegalRequirements } from "cms-auth/signup-legal/contracts";

export const PUBLIC_AUTH_ROUTES = {
    base: "/.cms/auth",
    signup: "/signup",
    signupLegalRequirements: "/signup/legal-requirements",
    login: "/login",
    logout: "/logout",
    me: "/me",
    requestEmailVerification: "/email/verification/request",
    confirmEmailVerification: "/email/verification/confirm",
    requestPasswordReset: "/password/reset/request",
    confirmPasswordReset: "/password/reset/confirm",
} as const;

export type PublicAuthRoutesConfig<Role extends string = string> = PublicAuthFlowConfig<Role> & {
    local: LocalAuthentication<Role>;
    allowSignup?: boolean;
};

export function registerPublicAuthRoutes<Role extends string>(runner: Runner, cfg: PublicAuthRoutesConfig<Role>): void {
    if (cfg.allowSignup !== false) {
        runner.addEndpoint("GET", PUBLIC_AUTH_ROUTES.signupLegalRequirements, async () =>
            privateAuthJsonResponse(await signupLegalRequirements(cfg)),
        );
        runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.signup, async (req) => {
            const body = await readJsonObject(req);
            await signupLocalUser(cfg, {
                email: requiredString(body, "email"),
                password: requiredString(body, "password"),
                acceptedLegalDocumentVersionIds: optionalRepeatedStrings(body, "acceptedLegalDocumentVersionIds"),
            });
            return ok();
        });
    }

    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.login, (req) => cfg.local.loginJson(req));
    runner.addEndpoint("POST", PUBLIC_AUTH_ROUTES.logout, () => cfg.local.logoutJson());
    runner.addEndpoint("GET", PUBLIC_AUTH_ROUTES.me, async (req) =>
        privateAuthJsonResponse({ subject: await resolveRequestSubject(cfg.local, req) }),
    );

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

async function signupLegalRequirements<Role extends string>(
    cfg: PublicAuthRoutesConfig<Role>,
): Promise<SignupLegalRequirements> {
    return cfg.signupLegalAcceptance?.requirements() ?? { documents: [] };
}

const ok = (): Response => privateAuthJsonResponse({ ok: true });
