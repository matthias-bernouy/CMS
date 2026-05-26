import type { Db } from "mongodb";
import { createProvider, type LogStore, type Provider } from "@bernouy/tenant-provisioner-sdk";
import { makeCmsHooks, type CmsTenantRuntime } from "./hooks";
import { makeCmsDomain } from "./domain";
import { CMS_TENANT_CONFIG } from "./tenantConfig";
import { MongoTenantConfigStore } from "./MongoTenantConfigStore";
import { DEFAULT_CMS_PROVIDER_ID } from "./constants";

export interface CreateCmsProviderOptions {
    /** Mongo Db persisting the §11 config (the admin-OIDC blob the hub sets). */
    db: Db;
    /** Issuer URL the hub mints control-plane tokens under (allowlisted). */
    hubIssuer: string;
    /** Browser-facing admin runtime the lifecycle hooks drive (mount/unmount
     *  the tenant's CMS admin). Implemented at the composition root by adapting
     *  `MtControlCms`. */
    runtime: CmsTenantRuntime;
    /** Defaults to `"cms-control"`. */
    providerId?: string;
    /** Inject a custom log store; otherwise a daily-rotated FileLogStore. */
    logStore?: LogStore;
    logDir?:   string;
}

/**
 * The CMS control surface as a conforming tenant-provisioner: importable by
 * the hub, with per-tenant provisioning driven by an injected admin `runtime`
 * and an OIDC-only §11 config. Everything in base.md (auth, planes,
 * provisioning, logs, RFC 7807, OpenAPI, §11 config) comes from the SDK; this
 * wires the lifecycle hooks + the config schema/store. The tenant's CMS data
 * (collection set + `system` record) is owned by the runtime, not here.
 */
export function createCmsProvider(opts: CreateCmsProviderOptions): Provider {
    return createProvider({
        config: {
            providerId: opts.providerId ?? DEFAULT_CMS_PROVIDER_ID,
            allowlist:  [{ iss: opts.hubIssuer, role: "control-plane" }],
        },
        hooks:        makeCmsHooks({ runtime: opts.runtime }),
        domain:       makeCmsDomain(),
        tenantConfig: { ...CMS_TENANT_CONFIG, store: new MongoTenantConfigStore(opts.db) },
        ...(opts.logStore ? { store: opts.logStore } : opts.logDir ? { logDir: opts.logDir } : {}),
    });
}

export { CMS_TENANT_CONFIG } from "./tenantConfig";
export type { CmsTenantConfig } from "./tenantConfig";
export { MongoTenantConfigStore } from "./MongoTenantConfigStore";
export { makeCmsHooks } from "./hooks";
export type { CmsHooksOptions, CmsTenantRuntime, CmsAdminOidc } from "./hooks";
export { DEFAULT_CMS_PROVIDER_ID } from "./constants";
