import type { SecretReader } from "cms-secrets/interfaces/SecretReader";

/**
 * Storage contract for admin-managed secrets (API keys, bearer tokens,
 * webhook signing keys…). Strictly distinct from the public `TSystem`
 * settings: those are fetched by the admin UI and surface in the rendered
 * DOM; secrets MUST NOT travel that path. Consumers that only need to know
 * which keys exist (e.g. an editor dropdown for `${VAR}` references) call
 * `listKeys()` — values never leave the server unless the admin UI
 * explicitly asks via `list()`.
 *
 * Implementations are pluggable: the default in-memory store is fine for
 * dev / tests; a Vault- or AWS-Secrets-Manager-backed impl can drop in
 * unchanged. Encryption at rest, rotation, audit logging are
 * implementation concerns — the interface stays minimal.
 *
 * Key naming convention (enforced at the validation layer, not here):
 * `^[A-Z][A-Z0-9_]*$` — env-var style, matches the `${KEY_NAME}` reference
 * pattern already used in data-provider config.
 */
export interface SecretStore extends SecretReader {
    /** Upsert. Replaces any existing value at `key`. */
    set(key: string, value: string): Promise<void>;

    /** No-op when the key doesn't exist. */
    delete(key: string): Promise<void>;

    /** Full snapshot — admin-only path. Each entry includes its plain value. */
    list(): Promise<Array<{ key: string; value: string }>>;

    /** Key names only — safe surface for editor / consumer code that needs
     *  to know which secrets are available without reading their values. */
    listKeys(): Promise<string[]>;
}
