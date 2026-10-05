import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readBoundedRequestBody } from "@bernouy/http-runner";

export const MAX_CONTROL_JSON_BYTES = 4 * 1024 * 1024;

/**
 * Parse the request body as JSON. Returns a guaranteed-object value; throws
 * `InvalidParam("body")` for malformed JSON or non-object roots. Endpoints
 * can then destructure fields without re-checking the wrapper type.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
    const bytes = await readBoundedRequestBody(req, MAX_CONTROL_JSON_BYTES);
    const body = parseJson(bytes);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new InvalidParam("body", "JSON object expected.");
    }
    return body as Record<string, unknown>;
}

function parseJson(bytes: Uint8Array): unknown {
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}
