/**
 * A namespace groups one or more tenants for a single logical entity (a
 * customer, a project, a region…). The hub does NOT create identity for
 * the namespace — it just stores metadata + its tenants.
 *
 * `namespaceId` is human-chosen and URL-safe (RFC 1123 label,
 * `^[a-z0-9-]{1,63}$`). It is NOT what the hub sends to a TP — each tenant
 * carries its own globally-unique `tenantId`.
 */
export interface Namespace {
    namespaceId:  string;
    displayName:  string;
    description?: string;
    createdAt:    Date;
}

/**
 * One tenant = one (namespace, TP) activation. A namespace may hold
 * MULTIPLE tenants of the SAME TP, so the row is keyed by a globally-unique
 * `tenantId` (RFC 1123 label) — that is the id the hub sends to the TP's
 * `POST /admin/tenants`.
 *
 * `issuers` is the trusted-issuer list forwarded to the TP (multi-issuer,
 * SDK base.md §8). It MAY be empty — a tenant can be created first and have
 * issuers attached later. `config` is the validated `providerConfig`
 * (against the TP's `tenantConfig` schema); the TP holds the canonical copy.
 */
export interface Tenant {
    tenantId:     string;
    namespaceId:  string;
    providerId:   string;
    displayName?: string;
    issuers:      string[];
    config?:      unknown;
    status:       "active" | "suspended";
    activatedAt:  Date;
}
