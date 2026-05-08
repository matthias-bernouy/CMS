// Public entry point for `@bernouy/hub-api`.

export { Hub }            from "./exports/Hub";
export { mountHubApi }    from "./exports/mountHubApi";
export type { MountHubApiOptions } from "./exports/mountHubApi";

export { HubError }       from "./core/HubError";
export type { HubErrorCode } from "./core/HubError";

export type { HubConfig, BucketDefaults } from "./interfaces/HubConfig";
export type { ProvisionTenantInput, ProvisionTenantResult } from "./core/schemas/provisionTenant";
