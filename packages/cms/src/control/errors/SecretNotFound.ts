/**
 * Thrown by `resolveSecretRefs` when a `${KEY}` reference can't be looked
 * up in the `SecretStore`. Callers (data provider, etc.) catch this to
 * fail-fast the request rather than letting the literal `${KEY}` text
 * leak onto the wire.
 */
export class SecretNotFound extends Error {
    constructor(public readonly key: string) {
        super(`Secret '${key}' not found`);
        this.name = "SecretNotFound";
    }
}
