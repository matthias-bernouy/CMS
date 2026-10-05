import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { readBoundedRequestBody } from "@bernouy/http-runner";

const MAX_COLLECTION_REQUEST_BYTES = 3 * 1024 * 1024;
/** Limit allocation before JSON parsing, including requests with no Content-Length. */
export async function collectionBody(req: Request): Promise<Record<string, unknown>> {
    if (!req.body) {
        throw Object.assign(new Error("JSON body required"), { status: 400 });
    }
    const bytes = await readBoundedRequestBody(req, MAX_COLLECTION_REQUEST_BYTES);
    try {
        const value = parseStrictJson(bytes, MAX_COLLECTION_REQUEST_BYTES, 64);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Object required");
        }
        return value as Record<string, unknown>;
    } catch {
        throw Object.assign(new Error("Invalid collection JSON"), { status: 400 });
    }
}
