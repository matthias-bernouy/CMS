import type { ProblemDocument } from "src/types/Problem";
import { SdkError } from "src/core/errors";

export const RFC7807_CONTENT_TYPE = "application/problem+json";

const TITLE: Record<number, string> = {
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 409: "Conflict",
    500: "Internal Server Error",
};

// base.md §6: opaque to the client for security-sensitive / internal
// statuses (never reveal which §4.5 step failed, no role/plane leak,
// no stack). The precise context goes to server logs (§10
// `onSecurity`), never into `detail`.
const OPAQUE_DETAIL: Record<number, string> = {
    401: "Authentication failed.",
    403: "Forbidden.",
    500: "Internal error.",
};

export interface ProblemOptions {
    /** Request path. No query string, no secrets. */
    instance?: string;
    /** Base for the `type` URI; providers SHOULD set their docs URL. */
    typeBase?: string;
}

/** Serialize any error to an RFC 7807 document + the HTTP bits. */
export function toProblem(
    err: unknown,
    opts: ProblemOptions = {},
): { status: number; headers: Record<string, string>; body: ProblemDocument } {
    const sdk = err instanceof SdkError ? err : null;
    const status = sdk?.httpStatus ?? 500;
    const slug = sdk?.problemType ?? "internal";
    const base = (opts.typeBase ?? "urn:data-provider:error").replace(/\/$/, "");

    // Actionable detail only for trusted, non-sensitive 4xx (400/404/409 —
    // hub/config facing). Everything else is opaque.
    const detail =
        OPAQUE_DETAIL[status] ??
        (sdk ? sdk.message : "Internal error.");

    const headers: Record<string, string> = { "Content-Type": RFC7807_CONTENT_TYPE };

    return {
        status,
        headers,
        body: {
            type:     `${base}/${slug}`,
            title:    TITLE[status] ?? "Error",
            status,
            detail,
            instance: opts.instance ?? "",
        },
    };
}

/** The outer middleware wraps every throw with this. */
export function problemResponse(err: unknown, opts: ProblemOptions = {}): Response {
    const p = toProblem(err, opts);
    return new Response(JSON.stringify(p.body), { status: p.status, headers: p.headers });
}
