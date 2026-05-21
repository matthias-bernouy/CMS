/**
 * One row in the hub's small meta-registry of data-providers it knows
 * about. The data themselves (tenants, configs, logs) live on each DP —
 * the hub only remembers WHO it has imported, plus a cache of their 4
 * discovery documents so the UI doesn't refetch on every render.
 */
export interface DataProviderImport {
    /** Identifier unique côté hub. Vient du `providerId` que le DP déclare
     *  dans `/.well-known/data-provider-info`. */
    providerId: string;

    /** Base URL of the data-provider, normalized (no trailing slash). */
    url: string;

    /** Human-readable label, set by the operator at import. Optional. */
    name?: string;

    /** Free-string kind (`"delivery"`, `"payment"`, …) from the DP's
     *  `/.well-known/data-provider-info`. Used by the UI for grouping. */
    providerKind?: string;

    /** `iss` declared in the DP's RFC 8414 metadoc. Stored so we don't
     *  re-parse the metadoc on every operation. */
    iss: string;

    importedAt: Date;
    /** Date of the last successful refresh of `schemas`. */
    cachedAt:   Date;

    /** Cached discovery documents. */
    schemas: {
        info:                Record<string, unknown>;   // /.well-known/data-provider-info
        metadoc:             Record<string, unknown>;   // /.well-known/oauth-authorization-server
        jwks:                Record<string, unknown>;   // { keys: [...] }
        openapiAdmin:        Record<string, unknown>;   // /openapi.admin.json
        tenantConfig?:       Record<string, unknown>;   // /openapi.tenant-config.json (may be 404)
        tenantConfigVersion?: string;
    };
}
