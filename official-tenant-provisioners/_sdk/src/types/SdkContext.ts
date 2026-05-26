import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { LogStore } from "src/interfaces/LogStore";
import type { TenantConfigContext } from "src/types/TenantConfigContext";
import type { TenantInfoProvider } from "src/types/TenantInfo";

/**
 * The single context the mount passes to every SDK file-routed handler
 * (`serveApi` takes one `system`). It is a superset: provisioning handlers
 * see it as `ProvisioningContext`, log handlers as `LogContext`, tenant-
 * config handlers as `TenantConfigEndpointContext`. `tenantConfig` is
 * optional — absent when the provider declared no schema; the §11 handlers
 * then respond 404.
 */
export interface SdkContext extends ProvisioningContext {
    store: LogStore;
    tenantConfig?: TenantConfigContext;
    /** Optional capability: TP-computed read-only info about a tenant. */
    tenantInfo?: TenantInfoProvider;
}

/** What the log retrieval handlers need (subset of SdkContext). */
export interface LogContext {
    store: LogStore;
}

/** What the §11 config handlers need (subset of SdkContext). `tenantConfig`
 *  is optional here too — the handler guards by checking presence before use. */
export interface TenantConfigEndpointContext {
    tenantConfig?: TenantConfigContext;
}

/** What the tenant-info handler needs (subset of SdkContext). Optional —
 *  the handler responds with empty fields when the provider declared none. */
export interface TenantInfoEndpointContext {
    tenantInfo?: TenantInfoProvider;
}
