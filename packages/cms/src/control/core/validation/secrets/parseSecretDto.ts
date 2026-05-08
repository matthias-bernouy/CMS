import InvalidParam from "src/control/errors/Http/InvalidParam";

export type SecretDto = { key: string; value: string };

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Validates an upsert payload for `/api/secrets`. The key follows the
 * env-var convention (`^[A-Z][A-Z0-9_]*$`) so it stays consistent with the
 * `${KEY_NAME}` reference syntax already used in data-provider config.
 *
 * Empty values are allowed — a deployed CMS may legitimately want to clear
 * a secret without deleting the entry (e.g. to keep its key visible in
 * dropdowns until a real value is provided). To remove the entry entirely,
 * call `DELETE /api/secrets?key=…` instead.
 */
export function parseSecretDto(body: Record<string, unknown>): SecretDto {
    const key = body.key;
    if (typeof key !== "string" || key.length === 0) {
        throw new InvalidParam("key", "must be a non-empty string");
    }
    if (!KEY_PATTERN.test(key)) {
        throw new InvalidParam("key", "must match /^[A-Z][A-Z0-9_]*$/ (env-var style)");
    }
    if (key.length > 128) {
        throw new InvalidParam("key", "max 128 characters");
    }

    const value = body.value;
    if (typeof value !== "string") {
        throw new InvalidParam("value", "must be a string (use empty string to clear)");
    }

    return { key, value };
}

export function validateSecretKey(key: string): void {
    if (!KEY_PATTERN.test(key)) {
        throw new InvalidParam("key", "must match /^[A-Z][A-Z0-9_]*$/ (env-var style)");
    }
}
