import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

export type SecretDto = { key: string; value: string };

/**
 * Extract a `/api/secrets` upsert body: presence + shape coercion only. The
 * key-format rule lives in `@bernouy/cms-secrets` (validated at write time by
 * `ValidatingSecretStore`). Empty values are allowed (clear without delete).
 */
export function parseSecretDto(body: Record<string, unknown>): SecretDto {
    const { key, value } = body;
    if (typeof key !== "string" || key.length === 0) {
        throw new InvalidParam("key", "must be a non-empty string");
    }
    if (typeof value !== "string") {
        throw new InvalidParam("value", "must be a string (use empty string to clear)");
    }
    return { key, value };
}
