import { AccessError } from "cms-auth/application/core/access/errors";
/** Preserve business normalization in account, alias and token workflows. */
export function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new AccessError("INVALID_INPUT");
    }
    return value.trim();
}
