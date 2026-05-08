// Public entry point for `@bernouy/mt-cms-control`.
//
// Consumers wire one `MtControlCms` instance at boot, pass it the shared
// runner + Mongo Db + a platform-level `Authentication<SuperadminRole>`,
// and call `init()`. From there the superadmin surface is reachable at
// `/superadmin/*` and per-tenant CMS Control instances are mounted
// dynamically as tenants are added through the superadmin UI.

export { MtControlCms } from "src/exports/MtControlCms";
export type { MtControlCmsDeps, SuperadminRole, TenantRole } from "src/exports/MtControlCms";

export * from "src/exports/MtControlClient";

export type { Tenant, TenantKeycloak, TenantCdnBucket, TenantDelivery } from "src/interfaces/Tenant";
export type { TenantRepository } from "src/interfaces/TenantRepository";

export { MongoTenantRepository } from "src/default-implementation/MongoTenantRepository";
