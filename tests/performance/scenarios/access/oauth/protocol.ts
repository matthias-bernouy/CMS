import { requireRecord, assertCondition } from "../../queries/types";

/** The admitted envelope can succeed while OAuth refuses; that is never a successful nominal result. */
export function oauthDocument(output: unknown) {
    const envelope = requireRecord(output);
    assertCondition(typeof envelope.resultJson === "string");
    return requireRecord(JSON.parse(envelope.resultJson));
}

export function oauthSuccess(output: unknown) {
    const value = oauthDocument(output);
    assertCondition(!Object.hasOwn(value, "error"));
    return value;
}

export function oauthRedirect(value: Readonly<Record<string, unknown>>, callback: string, state: string) {
    assertCondition(typeof value.redirectUri === "string");
    const url = new URL(value.redirectUri);
    assertCondition(url.origin === new URL(callback).origin && url.pathname === new URL(callback).pathname);
    assertCondition(url.searchParams.get("state") === state);
    return url;
}
