import { AuthValidationError } from "cms-auth/core/validation";

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AuthValidationError("body", "object expected");
    }
    return body as Record<string, unknown>;
}

export function requiredString(body: Record<string, unknown>, field: string): string {
    const value = body[field];
    if (typeof value !== "string" || !value) {
        throw new AuthValidationError(field, "required");
    }
    return value;
}

/**
 * Native repeated fields encode one selected value as a scalar and several as
 * an array. Normalize that transport quirk without relaxing domain validation.
 */
export function optionalRepeatedStrings(body: Record<string, unknown>, field: string): string[] | undefined {
    const value = body[field];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string" && value) {
        return [value];
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry)) {
        return value;
    }
    throw new AuthValidationError(field, "non-empty string or array of non-empty strings expected");
}
