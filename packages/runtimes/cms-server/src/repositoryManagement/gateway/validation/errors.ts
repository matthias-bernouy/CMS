import type { RepositoryManagementTransportResponse } from "../transport";
import { assertEqual, canonicalText, exactObject, positiveInteger, type JsonObject } from "./helpers";

export type SanitizedRepositoryManagementResult = Readonly<{
    status: number;
    body: JsonObject;
    retryAfter?: string;
}>;

export function rateLimitResult(response: RepositoryManagementTransportResponse): SanitizedRepositoryManagementResult {
    const body = exactObject(response.body, ["code", "error", "retryAfterSeconds"]);
    assertEqual(body.code, "management_rate_limited");
    canonicalText(body.error, 1_024);
    const retryAfterSeconds = positiveInteger(body.retryAfterSeconds);
    const retryAfter = response.retryAfter;
    if (!retryAfter || !/^[1-9][0-9]*$/u.test(retryAfter) || Number(retryAfter) !== retryAfterSeconds) {
        throw new TypeError("Repository management Retry-After contract failed");
    }
    return {
        status: 429,
        retryAfter,
        body: {
            code: "management_rate_limited",
            error: "Repository management rate limit exceeded",
            retryAfterSeconds,
        },
    };
}

export function simpleErrorResult(
    response: RepositoryManagementTransportResponse,
    status: number,
    code: string,
    error: string,
): SanitizedRepositoryManagementResult {
    const body = exactObject(response.body, ["code", "error"]);
    assertEqual(response.status, status);
    assertEqual(body.code, code);
    canonicalText(body.error, 2_048);
    return { status, body: { code, error } };
}
