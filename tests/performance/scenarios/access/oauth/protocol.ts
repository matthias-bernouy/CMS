import { ClientFailure } from "../../../harness/clients/failure";
import { requireRecord, assertCondition } from "../../queries/types";

/** The admitted envelope can succeed while OAuth refuses; that is never a successful nominal result. */
export function oauthDocument(output: unknown) {
    const envelope = requireRecord(output);
    assertCondition(typeof envelope.resultJson === "string");
    return requireRecord(JSON.parse(envelope.resultJson));
}

export function oauthSuccess(output: unknown) {
    const value = oauthDocument(output);
    if (Object.hasOwn(value, "error")) {
        throw oauthRefusal("oauth-protocol-refused", value);
    }
    return value;
}

export function oauthRedirect(value: Readonly<Record<string, unknown>>, callback: string, state: string) {
    assertCondition(typeof value.redirectUri === "string");
    const url = new URL(value.redirectUri);
    assertCondition(url.origin === new URL(callback).origin && url.pathname === new URL(callback).pathname);
    assertCondition(url.searchParams.get("state") === state);
    return url;
}

/** Only known protocol symbols and numeric HTTP statuses may enter persisted diagnostics. */
export function oauthRefusal(prefix: string, value: Readonly<Record<string, unknown>>) {
    const allowed = [
        "invalid_request",
        "invalid_client",
        "invalid_client_metadata",
        "invalid_grant",
        "invalid_token",
        "invalid_scope",
        "unsupported_grant_type",
        "access_denied",
        "temporarily_unavailable",
    ];
    const code = typeof value.error === "string" && allowed.includes(value.error) ? value.error : "unknown";
    const status =
        typeof value.status === "number" &&
        Number.isSafeInteger(value.status) &&
        value.status >= 100 &&
        value.status <= 599
            ? value.status
            : "unknown";
    return new ClientFailure(`${prefix}-${code}-${status}`);
}
