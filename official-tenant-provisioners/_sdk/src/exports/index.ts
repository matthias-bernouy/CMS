// Public barrel of `@bernouy/tenant-provisioner-sdk`. Only what a provider author
// is allowed to consume crosses this boundary (cf. _sdk.md, import-rules.md).

export { createProvider }                       from "src/exports/createProvider";
export type { CreateProviderOptions, Provider } from "src/exports/createProvider";
export { requestContext }                       from "src/core/http/requestContext";
export { requestRecorder }                      from "src/core/http/requestRecorder";
export { requireTenantScope }                   from "src/core/http/requireTenantScope";
export type { ProviderDomain }                  from "src/types/ProviderDomain";

// Tenant config (base.md §11)
export type { TenantConfigSchema }              from "src/interfaces/TenantConfigSchema";
export type { TenantConfigStore }               from "src/interfaces/TenantConfigStore";
export { MemoryTenantConfigStore }              from "src/default-implementation/MemoryTenantConfigStore";
export { assertTenantWritable, extractWritability }
                                                from "src/core/tenantConfig/filterWritable";
export type { WritabilityMap, WritableRole }    from "src/core/tenantConfig/extractWritability";
export { stripWriteOnly }                       from "src/core/tenantConfig/stripWriteOnly";
export { isVisible }                            from "src/core/tenantConfig/isVisible";
export type { VisibleIfClause }                 from "src/core/tenantConfig/isVisible";
export { defineTenantConfig }                   from "src/core/tenantConfig/defineTenantConfig";
export type { FieldAnnotation, DefineTenantConfigOptions }
                                                from "src/core/tenantConfig/defineTenantConfig";

// Errors
export {
    SdkError, ConfigError, ValidationError, AuthError, PlaneError,
    SuspendedError, ProvisioningError,
} from "src/core/errors";
export { problemResponse, toProblem, RFC7807_CONTENT_TYPE } from "src/core/http/problem";
export type { ProblemDocument } from "src/types/Problem";

// Contracts a provider author implements / receives
export type {
    ProviderConfig, AllowlistEntry, AllowlistRole,
    CryptoProfile, DeprovisionPolicy,
} from "src/interfaces/ProviderConfig";
export type {
    TenantRegistry, TenantState, TenantStatus,
    TenantUpsert, TenantPatch,
} from "src/interfaces/TenantRegistry";
export type {
    ProviderHooks, ProvisionInput, UpdateInput, DeprovisionInput,
} from "src/interfaces/hooks";
export type { ProviderContext } from "src/types/ProviderContext";
export type { TenantInfo, TenantInfoField, TenantInfoProvider } from "src/types/TenantInfo";
export type { TokenClaims, TokenScope } from "src/types/claims";
export type { ResolvedIssuer } from "src/types/ResolvedIssuer";

// Logging (base.md §10)
export { createRecorder }       from "src/core/log/recorder";
export type { Recorder }        from "src/interfaces/Recorder";
export type { LogStore, LogQuery, LogPage } from "src/interfaces/LogStore";
export type {
    LogRecord, LogInput, LogKind, LogLevel, LogActor, LogVisibility,
} from "src/types/LogRecord";
export { LOG_SCHEMA_VERSION, EVENT_CATALOG_VERSION } from "src/constants";

// Default impls (a provider may inject its own). MemoryAuditSink and
// RecorderAuditSink stay internal — `createProvider` wires them itself and
// there's no public way to inject a custom AuditSink yet.
export { MemoryTenantRegistry } from "src/default-implementation/MemoryTenantRegistry";
export { MemoryLogStore }       from "src/default-implementation/MemoryLogStore";
export { FileLogStore }         from "src/default-implementation/FileLogStore";

export { TENANT_PROVISIONER_CONTRACT_VERSION } from "src/constants";
