// Public entry point for `@bernouy/hub-api`.

export { Hub }                       from "./exports/Hub";
export { mountHubApi }               from "./exports/mountHubApi";
export type { MountHubApiOptions }   from "./exports/mountHubApi";

export { HubError }                  from "./core/HubError";
export type { HubErrorCode }         from "./core/HubError";
export { hubErrorResponse, HUB_ERROR_HTTP } from "./core/HubErrorHttp";

export type { HubConfig }            from "./interfaces/HubConfig";

// Data-provider registry surface.
export type { DataProviderImport }            from "./interfaces/DataProviderImport";
export type { DataProviderImportsRepository } from "./interfaces/DataProviderImportsRepository";
export { MemoryDataProviderImportsRepository } from "./default-implementation/MemoryDataProviderImportsRepository";
export { MongoDataProviderImportsRepository }  from "./default-implementation/MongoDataProviderImportsRepository";

// Namespace registry surface.
export type { Namespace, Tenant }              from "./interfaces/Namespace";
export type { NamespaceRepository }            from "./interfaces/NamespaceRepository";
export { MemoryNamespaceRepository }           from "./default-implementation/MemoryNamespaceRepository";
export { MongoNamespaceRepository }            from "./default-implementation/MongoNamespaceRepository";
