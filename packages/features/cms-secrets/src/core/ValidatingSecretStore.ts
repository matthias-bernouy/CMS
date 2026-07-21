import type { SecretStore } from "cms-secrets/interfaces/SecretStore";
import { secretKeyError } from "cms-secrets/core/secretRef";

/** Thrown when a secret key breaks the env-var naming rule. Carries `.status`
 *  so any HTTP surface maps it to a 400 without importing surface errors. */
export class SecretValidationError extends Error {
    status = 400;
    constructor(message: string) {
        super(message);
        this.name = "SecretValidationError";
    }
}

/**
 * The secret-key naming rule (the domain rule, owned here). Keys follow the
 * env-var convention so they stay consistent with the `${KEY_NAME}` reference
 * syntax used in data-provider config. Throws `SecretValidationError`.
 */
export function validateSecretKey(key: string): void {
    const err = secretKeyError(key);
    if (err) {
        throw new SecretValidationError(err);
    }
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

    get(key: string) {
        return this.inner.get(key);
    }
    delete(key: string) {
        return this.inner.delete(key);
    }
    list() {
        return this.inner.list();
    }
    listKeys() {
        return this.inner.listKeys();
    }
}
