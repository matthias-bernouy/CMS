import type { LocalAuthenticationActions } from "cms-auth/application/interfaces/LocalAuthenticationActions";
import { sanitizeReturnTo } from "cms-auth/sessions/core/cookies";
import { privateAuthJsonResponse, privateAuthResponse } from "cms-auth/application/http/handlers/authResponse";
import { readCredentials } from "cms-auth/application/http/input/localRequestInput";

export async function localLoginHandler(local: LocalAuthenticationActions, request: Request): Promise<Response> {
    const input = await readCredentials(request);
    const result = await local.authenticate(input.email, input.password);
    const returnTo = input.returnTo ? `&returnTo=${encodeURIComponent(input.returnTo)}` : "";
    if (!result.ok) {
        const error = result.error === "rate_limited" ? "rate_limited" : "1";
        return privateAuthResponse(null, {
            status: 302,
            headers: { Location: `${local.loginUrl}?error=${error}${returnTo}` },
        });
    }
    return privateAuthResponse(null, {
        status: 302,
        headers: { Location: sanitizeReturnTo(input.returnTo, local.defaultHome), "Set-Cookie": result.cookie },
    });
}

export async function localLoginJsonHandler(local: LocalAuthenticationActions, request: Request): Promise<Response> {
    const input = await readCredentials(request);
    const result = await local.authenticate(input.email, input.password);
    if (!result.ok) {
        return privateAuthJsonResponse({ error: result.error }, result.error === "rate_limited" ? 429 : 401);
    }
    return privateAuthJsonResponse({ subject: result.subject }, 200, { "Set-Cookie": result.cookie });
}

export function localLogoutHandler(local: LocalAuthenticationActions, request: Request): Response {
    const target = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"), local.defaultHome);
    return privateAuthResponse(null, {
        status: 302,
        headers: { Location: target, "Set-Cookie": local.clearSession() },
    });
}

export function localLogoutJsonHandler(local: LocalAuthenticationActions): Response {
    return privateAuthJsonResponse({ ok: true }, 200, { "Set-Cookie": local.clearSession() });
}
