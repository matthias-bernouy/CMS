import { AuthValidationError } from "cms-auth/application/core/validation";

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

export function readBearer(req: Request): string | null {
    const header = req.headers.get("authorization");
    const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
    return match?.[1] ?? null;
}
