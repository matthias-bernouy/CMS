import { AuthValidationError } from "cms-auth/application/core/validation";
import { readBoundedRequestBody } from "@bernouy/http-runner";

export const MAX_AUTH_REQUEST_BYTES = 64 * 1024;

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
    const bytes = await readBoundedRequestBody(req, MAX_AUTH_REQUEST_BYTES);
    const body = parseJson(bytes);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AuthValidationError("body", "object expected");
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

export function requiredString(body: Record<string, unknown>, field: string): string {
    const value = body[field];
    if (typeof value !== "string" || !value) {
        throw new AuthValidationError(field, "required");
    }
    return value;
}

export function readBearer(req: Request): string | null {
    const header = req.headers.get("authorization");
    const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
    return match?.[1] ?? null;
}
