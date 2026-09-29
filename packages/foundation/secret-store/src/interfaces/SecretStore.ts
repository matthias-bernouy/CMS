import type { SecretReader } from "secret-store/interfaces/SecretReader";

/**
 * Storage contract for named secrets (API keys, bearer tokens, signing keys).
 * Consumers that only need to know which keys exist call `listKeys()`;
 * values should be disclosed only to authorized server-side consumers.
 *
 * Implementations are pluggable: the default in-memory store is fine for
 * dev / tests; a Vault- or AWS-Secrets-Manager-backed impl can drop in
 * unchanged. Encryption at rest, rotation, audit logging are
 * implementation concerns — the interface stays minimal.
 *
 * Key naming convention (enforced by `ValidatingSecretStore`):
 * `^[A-Z][A-Z0-9_]*$` — env-var style, matching `${KEY_NAME}` references.
 */
export interface SecretStore extends SecretReader {
    /** Upsert. Replaces any existing value at `key`. */
    set(key: string, value: string): Promise<void>;

    /** No-op when the key doesn't exist. */
    delete(key: string): Promise<void>;

    /** Key names only, without reading secret values. */
    listKeys(): Promise<string[]>;
}
