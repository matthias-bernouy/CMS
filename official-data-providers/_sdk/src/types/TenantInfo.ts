/**
 * Read-only, **DP-computed** facts about a tenant, surfaced to the hub for
 * display. A third channel distinct from:
 *   - the §11 `tenantConfig` (hub-WRITTEN config), and
 *   - the generic SDK tenant fields (`issuers`, `status`, …).
 *
 * Example: a Keycloak DP surfaces its realm issuer URL
 * (`<base>/realms/<tenantId>`) — labelled freely so it doesn't collide with
 * the platform's `issuers[]`.
 */
export type TenantInfoField = {
    label: string;
    value: string;
    /** Render hint for the hub UI: plain text (default), a link, or monospace. */
    kind?: "text" | "url" | "code";
};

export interface TenantInfo {
    fields: TenantInfoField[];
}

/** Optional capability passed to `createProvider`. The SDK auto-mounts
 *  `GET /admin/info?tenantId=` (control-plane) that calls it. */
export type TenantInfoProvider = (ctx: { tenantId: string }) => Promise<TenantInfo>;
