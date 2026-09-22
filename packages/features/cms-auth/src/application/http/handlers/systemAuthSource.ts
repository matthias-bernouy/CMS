import type { PublicAuthRoutesConfig } from "cms-auth/application/http/handlers/publicAuthHandlers";
import type { PublicAuthActions } from "cms-auth/application/interfaces/PublicAuthActions";
import { AuthValidationError } from "cms-auth/application/core/validation";
import { privateAuthJsonResponse, privateAuthResponse } from "cms-auth/application/http/handlers/authResponse";
import { readJsonObject, requiredString } from "cms-auth/application/http/input/requestInput";

type SystemSourceEndpoint = {
    urn: string;
    targetUrl: string;
};

export async function executeAuthSystemSourceEndpoint(
    cfg: PublicAuthRoutesConfig,
    endpoint: SystemSourceEndpoint,
    req: Request,
): Promise<Response> {
    const actions = cfg;
    const target = parseSystemAuthTarget(endpoint);
    switch (target) {
        case "/me":
            return privateAuthJsonResponse({
                subject: await actions.subject(req),
            });
        case "/login":
            return actions.login(req);
        case "/logout":
            return actions.logout();
        case "/signup": {
            if (cfg.allowSignup === false) {
                return privateAuthResponse("not_found", { status: 404 });
            }
            await signup(req, actions);
            return ok();
        }
        case "/email/verification/request": {
            const body = await readJsonObject(req);
            await actions.requestEmailVerification({
                email: requiredString(body, "email"),
            });
            return ok();
        }
        case "/email/verification/confirm": {
            const body = await readJsonObject(req);
            await actions.confirmEmailVerification({
                token: requiredString(body, "token"),
            });
            return ok();
        }
        case "/password/reset/request": {
            const body = await readJsonObject(req);
            await actions.requestPasswordReset({ email: requiredString(body, "email") });
            return ok();
        }
        case "/password/reset/confirm": {
            const body = await readJsonObject(req);
            await actions.confirmPasswordReset({
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

async function signup(request: Request, actions: PublicAuthActions): Promise<void> {
    const body = await readJsonObject(request);
    await actions.signup({
        email: requiredString(body, "email"),
        password: requiredString(body, "password"),
    });
}
