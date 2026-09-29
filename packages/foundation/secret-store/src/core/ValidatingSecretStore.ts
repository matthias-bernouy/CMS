import type { SecretStore } from "secret-store/interfaces/SecretStore";
import { secretKeyError } from "secret-store/core/secretRef";

/** Thrown when a secret key breaks the configured naming rule. */
export class SecretValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SecretValidationError";
    }
}

/**
 * Keys follow the env-var convention so they stay consistent with the
 * `${KEY_NAME}` reference syntax. Throws `SecretValidationError`.
 */
export function validateSecretKey(key: string): void {
    const err = secretKeyError(key);
    if (err) {
        throw new SecretValidationError(err);
    }
}

/**
 * Decorator that validates the key on every `set` before delegating — the
 * unbypassable barrier so no writer can store a
 * malformed key. Reads, deletes, and key listings pass straight through.
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
    listKeys() {
        return this.inner.listKeys();
    }
}
