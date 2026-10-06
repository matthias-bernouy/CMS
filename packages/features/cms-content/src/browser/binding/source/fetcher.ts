/**
 * The network primitive for `cms-source`. Resolves a URL to a discriminated
 * outcome and NEVER throws — the controller branches on `kind` to pick a slot.
 *
 * Status handling (decided in the design pass):
 *  - 2xx with a JSON body            → `success` with the parsed data.
 *  - 2xx empty body / 204 No Content → `success` with `null` (an empty result,
 *                                      not an error — the `empty` slot, if any,
 *                                      handles the display).
 *  - 2xx with an unparseable body    → `error` (status carried, message says so).
 *  - non-2xx                         → `error` with the HTTP `status`, so a
 *                                      template can branch (`{{ status }}`) and a
 *                                      future global interceptor can act on
 *                                      401/403 without each source knowing.
 *  - aborted request                 → `aborted` (caller drops it silently).
 *  - network failure                 → `error` with `status: null`.
 */

export type FetchOutcome =
    | { kind: "success"; data: unknown }
    | { kind: "error"; status: number | null; message: string }
    | { kind: "aborted" };

export async function runFetch(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<FetchOutcome> {
    let res: Response;
    try {
        const headers = new Headers(init.headers);
        if (!headers.has("Accept")) {
            headers.set("Accept", "application/json");
        }
        res = await fetch(url, { ...init, headers, signal });
    } catch (err) {
        return isAbort(err) ? { kind: "aborted" } : { kind: "error", status: null, message: messageOf(err) };
    }

    if (!res.ok) {
        return { kind: "error", status: res.status, message: `HTTP ${res.status}` };
    }

    let body: string;
    try {
        body = await res.text();
    } catch (err) {
        return isAbort(err) ? { kind: "aborted" } : { kind: "error", status: res.status, message: messageOf(err) };
    }

    if (body.trim() === "") {
        return { kind: "success", data: null };
    }

    try {
        return { kind: "success", data: JSON.parse(body) };
    } catch {
        return { kind: "error", status: res.status, message: "Invalid JSON response" };
    }
}

function isAbort(err: unknown): boolean {
    return (err as { name?: string } | null)?.name === "AbortError";
}

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
