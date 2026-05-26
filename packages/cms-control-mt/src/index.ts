// Public entry point for `@bernouy/mt-cms-control`.
//
// Consumers wire one `MtControlCms` instance at boot, pass it the shared
// runner + Mongo Db + a `SecretCrypto`, and call `init()` to boot-mount the
// tenants already in the registry. Provisioning is hub-driven: the
// `cms-control` tenant-provisioner's hooks call `provisionTenant` /
// `reprovisionTenant` / `deprovisionTenant`. Per-tenant CMS Control instances
// mount dynamically without a restart.

export { MtControlCms } from "src/exports/MtControlCms";
export type { MtControlCmsDeps, TenantProvisionInput, TenantRole } from "src/exports/MtControlCms";

export type { Tenant, TenantKeycloak, TenantDelivery } from "src/interfaces/Tenant";
export type { TenantRepository } from "src/interfaces/TenantRepository";

export { MongoTenantRepository } from "src/default-implementation/MongoTenantRepository";
