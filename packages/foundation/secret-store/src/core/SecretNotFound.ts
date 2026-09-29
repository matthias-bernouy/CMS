/**
 * Thrown by `resolveSecretRefs` when a `${KEY}` reference cannot be found.
 * Callers can fail before forwarding unresolved text to another system.
 */
export class SecretNotFound extends Error {
    constructor(public readonly key: string) {
        super(`Secret '${key}' not found`);
        this.name = "SecretNotFound";
    }
}
