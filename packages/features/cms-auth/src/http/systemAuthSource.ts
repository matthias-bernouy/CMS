import type { PublicAuthRoutesConfig } from "cms-auth/http/publicAuthHandlers";
import {
    confirmEmailVerification,
    confirmPasswordReset,
    requestEmailVerification,
    requestPasswordReset,
    prepareSignupLocalUser,
} from "cms-auth/core/public-auth/flows";
import { AuthValidationError } from "cms-auth/core/validation";
import { privateAuthJsonResponse, privateAuthResponse } from "cms-auth/http/authResponse";
import { readJsonObject, requiredString } from "cms-auth/http/requestInput";
import { resolveRequestSubject } from "cms-auth/http/requestSubject";

type SystemSourceEndpoint = {
    urn: string;
    targetUrl: string;
};

export type AuthSystemSourceHooks = {
    /** Keeps integration-only response data in-process and out of the public HTTP body. */
    attachTriggerResponseBody?: (response: Response, body: unknown) => void;
    /** Defers activation until synchronous response policies have succeeded. */
    attachTriggerResponseFinalizer?: (response: Response, finalizer: () => Promise<void>) => void;
};

export async function executeAuthSystemSourceEndpoint<Role extends string>(
    cfg: PublicAuthRoutesConfig<Role>,
    endpoint: SystemSourceEndpoint,
    req: Request,
    hooks: AuthSystemSourceHooks = {},
): Promise<Response> {
    const target = parseSystemAuthTarget(endpoint);
    switch (target) {
        case "/me":
            return privateAuthJsonResponse({
                subject: await resolveRequestSubject(cfg.local, req),
            });
        case "/login":
            return cfg.local.loginJson(req);
        case "/logout":
            return cfg.local.logoutJson();
        case "/signup": {
            if (cfg.allowSignup === false) {
                return privateAuthResponse("not_found", { status: 404 });
            }
            const body = await readJsonObject(req);
            const prepared = await prepareSignupLocalUser(cfg, {
                email: requiredString(body, "email"),
                password: requiredString(body, "password"),
            });
            const response = ok();
            hooks.attachTriggerResponseBody?.(response, {
                ok: true,
                cmsUserId: prepared.cmsUserId,
            });
            if (hooks.attachTriggerResponseFinalizer) {
                hooks.attachTriggerResponseFinalizer(response, async () => {
                    await prepared.finalize();
                });
            } else {
                await prepared.finalize();
            }
            return response;
        }
        case "/email/verification/request": {
            const body = await readJsonObject(req);
            await requestEmailVerification(cfg, {
                email: requiredString(body, "email"),
            });
            return ok();
        }
        case "/email/verification/confirm": {
            const body = await readJsonObject(req);
            await confirmEmailVerification(cfg, {
                token: requiredString(body, "token"),
            });
            return ok();
        }
        case "/password/reset/request": {
            const body = await readJsonObject(req);
            await requestPasswordReset(cfg, { email: requiredString(body, "email") });
            return ok();
        }
        case "/password/reset/confirm": {
            const body = await readJsonObject(req);
            await confirmPasswordReset(cfg, {
                token: requiredString(body, "token"),
                password: requiredString(body, "password"),
            });
            return ok();
        }
    }
    throw new AuthValidationError("endpoint", `unsupported auth system target for ${endpoint.urn}`);
}

function parseSystemAuthTarget(endpoint: SystemSourceEndpoint): string {
    let url: URL;
    try {
        url = new URL(endpoint.targetUrl);
    } catch {
        throw new AuthValidationError("endpoint", `invalid system target for ${endpoint.urn}`);
    }
    if (url.protocol !== "cms-system:" || url.hostname !== "auth") {
        throw new AuthValidationError("endpoint", `unsupported system target for ${endpoint.urn}`);
    }
    const target = url.pathname;
    if (!isKnownTarget(target)) {
        throw new AuthValidationError("endpoint", `unsupported auth system target for ${endpoint.urn}`);
    }
    return target;
}

function isKnownTarget(
    target: string,
): target is
    | "/me"
    | "/login"
    | "/logout"
    | "/signup"
    | "/email/verification/request"
    | "/email/verification/confirm"
    | "/password/reset/request"
    | "/password/reset/confirm" {
    return [
        "/me",
        "/login",
        "/logout",
        "/signup",
        "/email/verification/request",
        "/email/verification/confirm",
        "/password/reset/request",
        "/password/reset/confirm",
    ].includes(target);
}

const ok = (): Response => privateAuthJsonResponse({ ok: true });
