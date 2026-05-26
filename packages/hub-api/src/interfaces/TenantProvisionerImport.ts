/**
 * One row in the hub's small meta-registry of tenant-provisioners it knows
 * about. The data themselves (tenants, configs, logs) live on each TP —
 * the hub only remembers WHO it has imported, plus a cache of their 4
 * discovery documents so the UI doesn't refetch on every render.
 */
export interface TenantProvisionerImport {
    /** Identifier unique côté hub. Vient du `providerId` que le TP déclare
     *  dans `/.well-known/tenant-provisioner-info`. */
    providerId: string;

    /** Base URL of the tenant-provisioner, normalized (no trailing slash). */
    url: string;

    /** Human-readable label, set by the operator at import. Optional. */
    name?: string;

    /** Free-string kind (`"delivery"`, `"payment"`, …) from the TP's
     *  `/.well-known/tenant-provisioner-info`. Used by the UI for grouping. */
    providerKind?: string;

    /** `iss` declared in the TP's RFC 8414 metadoc. Stored so we don't
     *  re-parse the metadoc on every operation. */
    iss: string;

    importedAt: Date;
    /** Date of the last successful refresh of `schemas`. */
    cachedAt:   Date;

    /** Cached discovery documents. */
    schemas: {
        info:                Record<string, unknown>;   // /.well-known/tenant-provisioner-info
        metadoc:             Record<string, unknown>;   // /.well-known/oauth-authorization-server
        jwks:                Record<string, unknown>;   // { keys: [...] }
        openapiAdmin:        Record<string, unknown>;   // /openapi.admin.json
        tenantConfig?:       Record<string, unknown>;   // /openapi.tenant-config.json (may be 404)
        tenantConfigVersion?: string;
    };
}
