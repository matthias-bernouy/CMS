import type { SecretStore } from "cms-secrets/interfaces/SecretStore";

/** Thrown when a secret key breaks the env-var naming rule. Carries `.status`
 *  so any HTTP surface maps it to a 400 without importing surface errors. */
export class SecretValidationError extends Error {
    status = 400;
    constructor(message: string) {
        super(message);
        this.name = "SecretValidationError";
    }
}

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const MAX_KEY_LENGTH = 128;

/**
 * The secret-key naming rule (the domain rule, owned here). Keys follow the
 * env-var convention so they stay consistent with the `${KEY_NAME}` reference
 * syntax used in data-provider config. Throws `SecretValidationError`.
 */
export function validateSecretKey(key: string): void {
    if (key.length === 0)            throw new SecretValidationError("secret key is required");
    if (!KEY_PATTERN.test(key))      throw new SecretValidationError("secret key must match /^[A-Z][A-Z0-9_]*$/ (env-var style)");
    if (key.length > MAX_KEY_LENGTH) throw new SecretValidationError(`secret key too long; max ${MAX_KEY_LENGTH} characters`);
}

/**
 * Decorator that validates the key on every `set` before delegating — the
 * unbypassable barrier so no writer (admin API, CLI, …) can store a
 * malformed key. Reads/deletes/lists pass straight through.
 *
 *   `new ValidatingSecretStore(new EncryptedMongoSecretStore(...))`
 */
export class ValidatingSecretStore implements SecretStore {
    constructor(private readonly inner: SecretStore) {}

    async set(key: string, value: string): Promise<void> {
        validateSecretKey(key);
        return this.inner.set(key, value);
    }

    get(key: string)    { return this.inner.get(key); }
    delete(key: string) { return this.inner.delete(key); }
    list()              { return this.inner.list(); }
    listKeys()          { return this.inner.listKeys(); }
}
