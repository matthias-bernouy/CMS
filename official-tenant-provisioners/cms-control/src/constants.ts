/** Default `providerId` advertised in `/.well-known/tenant-provisioner-info`. */
export const DEFAULT_CMS_PROVIDER_ID = "cms-control";

/** Default Mongo collection prefix isolating one tenant's CMS space
 *  (one collection set per tenant in a shared Db). */
export const defaultCollectionPrefix = (tenantId: string): string => `tenant_${tenantId}__`;
