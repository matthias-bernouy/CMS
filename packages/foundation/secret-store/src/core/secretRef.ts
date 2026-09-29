export const SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export const SECRET_KEY_MAX_LENGTH = 128;

/**
 * Pattern matching one env-var-style secret reference. The `\$\{…\}` wrapper
 * makes refs unambiguous next to the `{{ … }}` templating channel.
 */
export const SECRET_REF_PATTERN = /\$\{([A-Z][A-Z0-9_]*)\}/;
export const SECRET_KEY_PATTERN_DESCRIPTION = "/^[A-Z][A-Z0-9_]*$/";
const EXACT_SECRET_REF_PATTERN = /^\$\{([A-Z][A-Z0-9_]*)\}$/;

export function secretRefGlobalPattern(): RegExp {
    return new RegExp(SECRET_REF_PATTERN.source, "g");
}

export function secretKeyError(key: string): string | null {
    if (key.length === 0) {
        return "secret key is required";
    }
    if (!SECRET_KEY_PATTERN.test(key)) {
        return `secret key must match ${SECRET_KEY_PATTERN_DESCRIPTION} (env-var style)`;
    }
    if (key.length > SECRET_KEY_MAX_LENGTH) {
        return `secret key too long; max ${SECRET_KEY_MAX_LENGTH} characters`;
    }
    return null;
}

export const isValidSecretKey = (key: string): boolean => secretKeyError(key) === null;

export function secretKeyToRef(key: string): string {
    return `\${${key}}`;
}

export function secretRefToKey(ref: string): string | null {
    return ref.match(EXACT_SECRET_REF_PATTERN)?.[1] ?? null;
}
