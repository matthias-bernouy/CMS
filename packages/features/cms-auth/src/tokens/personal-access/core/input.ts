import { AuthValidationError, validatePatName } from "cms-auth/application/core/validation";

export function personalAccessTokenInput(input: unknown, now = Date.now()): { name: string; expiresAt: Date | null } {
    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).some((key) => key !== "name" && key !== "expiresAt")
    ) {
        throw new AuthValidationError("token", "expected token name and optional expiry");
    }
    const value = input as Record<string, unknown>;
    if (typeof value.name !== "string" || !value.name.trim()) {
        throw new AuthValidationError("name", "a nonempty name is required");
    }
    const name = value.name.trim();
    validatePatName(name);
    if (value.expiresAt === undefined || value.expiresAt === null) {
        return { name, expiresAt: null };
    }
    if (typeof value.expiresAt !== "string" || value.expiresAt.length > 40) {
        throw new AuthValidationError("expiresAt", "expected a future date-time");
    }
    const expiresAt = new Date(value.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now) {
        throw new AuthValidationError("expiresAt", "expected a future date-time");
    }
    return { name, expiresAt };
}
