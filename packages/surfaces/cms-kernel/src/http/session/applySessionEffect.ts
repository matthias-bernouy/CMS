import { decodeSessionEffect, SESSION_EFFECT_HEADER } from "@bernouy/cms-gateway/protocol";

export type KernelSessionCookieConfig = Readonly<{ secure?: boolean }>;

const SESSION_COOKIE_NAME = "cms-session";

/** Applies a validated semantic session effect at the browser-facing Kernel boundary. */
export function applySessionEffect(response: Response, config: KernelSessionCookieConfig = {}): Response {
    const encoded = response.headers.get(SESSION_EFFECT_HEADER);
    if (encoded === null) {
        return response;
    }
    const effect = decodeSessionEffect(encoded);
    if (!effect) {
        return response;
    }
    const headers = new Headers(response.headers);
    headers.delete(SESSION_EFFECT_HEADER);
    headers.delete("set-cookie");
    headers.set("set-cookie", serializeCookie(effect, config.secure === true));
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function serializeCookie(effect: ReturnType<typeof decodeSessionEffect>, secure: boolean): string {
    const common = `HttpOnly; SameSite=Lax; Path=/${secure ? "; Secure" : ""}`;
    if (!effect || effect.operation === "clear") {
        return `${SESSION_COOKIE_NAME}=; ${common}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
    const expires = new Date(effect.expiresAt);
    const maxAge = Math.ceil((expires.getTime() - Date.now()) / 1_000);
    if (!Number.isSafeInteger(maxAge) || maxAge <= 0 || maxAge > 31 * 24 * 60 * 60) {
        throw new TypeError("Provider session expiry is outside the Kernel policy");
    }
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(effect.token)}; ${common}; Max-Age=${maxAge}; Expires=${expires.toUTCString()}`;
}
