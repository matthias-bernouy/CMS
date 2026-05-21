import type { Runner } from "@bernouy/core";
import type { z } from "zod";
import { defaultClock } from "@bernouy/data-provider-contract";
import type { TenantRegistry } from "src/interfaces/TenantRegistry";
import type { LogStore } from "src/interfaces/LogStore";
import type { JtiStore } from "src/interfaces/JtiStore";
import type { ProviderHooks } from "src/interfaces/hooks";
import type { ProviderDomain } from "src/types/ProviderDomain";
import type { SdkContext } from "src/types/SdkContext";
import type { TenantConfigSchema } from "src/interfaces/TenantConfigSchema";
import type { TenantConfigStore } from "src/interfaces/TenantConfigStore";
import type { TenantConfigContext } from "src/types/TenantConfigContext";
import { parseProviderConfig } from "src/core/schemas/providerConfig";
import { MemoryTenantRegistry } from "src/default-implementation/MemoryTenantRegistry";
import { FileLogStore } from "src/default-implementation/FileLogStore";
import { MemoryJtiStore } from "src/default-implementation/MemoryJtiStore";
import { RecorderAuditSink } from "src/default-implementation/RecorderAuditSink";
import { createRecorder } from "src/core/log/recorder";
import { makeSecurityLogger } from "src/core/log/securityAdapter";
import { createRegistryIssuerTrust } from "src/core/tenant/issuerTrust";
import { createVerifier } from "src/core/auth/verifyToken";
import { mountProvider } from "src/exports/mount";

/**
 * Tenant-config option passed at composition. Extends the wire-shape
 * `TenantConfigSchema` (served at `/openapi.tenant-config.json`) with the
 * runtime concerns (zod validation + store).
 */
export interface CreateProviderTenantConfig extends TenantConfigSchema {
    /** Full zod schema — used for cross-field validation after merge. */
    zod:     z.ZodTypeAny;
    /** `zod.partial()` — used to validate PATCH bodies. */
    partial: z.ZodTypeAny;
    /** Where the SDK persists this tenant's config (base.md §11). */
    store:   TenantConfigStore;
}

export interface CreateProviderOptions {
    config:    unknown;            // validated by parseProviderConfig
    registry?: TenantRegistry;     // default: in-memory
    /** Default: a **persistent** `FileLogStore` (base.md §8/§10 — audit must
     *  survive a restart). Inject a DB-backed store for high volume. */
    store?:    LogStore;
    /** Directory for the default daily-rotated `FileLogStore` when `store` is
     *  omitted. Default: `<cwd>/data-provider-logs`. */
    logDir?: string;
    /** Replay-protection store (base.md §4.5). Default: in-memory
     *  (`MemoryJtiStore`) — per-instance/best-effort. Inject a SHARED atomic
     *  store (e.g. Redis `SET NX PX`) for multi-instance deployments, where
     *  the in-memory default would let a `jti` replay on another instance. */
    jti?:      JtiStore;
    hooks:     ProviderHooks;
    domain:    ProviderDomain;
    /** §11 tenant config — declarative schema + storage capability. When
     *  set, the SDK auto-mounts the 3 config endpoints. Omit for providers
     *  without per-tenant business config (toy / passthrough). */
    tenantConfig?: CreateProviderTenantConfig;
}

export interface Provider {
    mount(runner: Runner): Promise<void>;
}

/** SDK composition root (cf. _sdk.md §2). Wires verify + tenancy + logging
 *  + provisioning + the provider domain; nothing else instantiates. */
export function createProvider(opts: CreateProviderOptions): Provider {
    const config   = parseProviderConfig(opts.config);
    const registry = opts.registry ?? new MemoryTenantRegistry();
    const store    = opts.store ?? new FileLogStore(
        opts.logDir ?? `${process.cwd()}/data-provider-logs`,
    );
    const now      = defaultClock;

    const recorder = createRecorder({ providerId: config.providerId, now, store });
    const rit = createRegistryIssuerTrust({
        allowlist: config.allowlist, registry, now,
        ttlSeconds: config.tenantStateCacheTtlSeconds,
    });
    const verify = createVerifier({
        config, issuerTrust: rit.trust, jti: opts.jti ?? new MemoryJtiStore(now), now,
        onSecurity: makeSecurityLogger(recorder),
    });
    const tenantConfigCtx: TenantConfigContext | undefined = opts.tenantConfig ? {
        version: opts.tenantConfig.version,
        schema:  opts.tenantConfig.schema,
        zod:     opts.tenantConfig.zod,
        partial: opts.tenantConfig.partial,
        store:   opts.tenantConfig.store,
    } : undefined;

    const sdkCtx: SdkContext = {
        registry, hooks: opts.hooks, audit: new RecorderAuditSink(recorder),
        invalidate: rit.cache.invalidate, now, store,
        ...(tenantConfigCtx ? { tenantConfig: tenantConfigCtx } : {}),
    };

    return {
        mount: (runner: Runner) =>
            mountProvider({
                runner, config, verify, rit, sdkCtx,
                domain: opts.domain, recorder,
                ...(opts.tenantConfig ? { tenantConfig: opts.tenantConfig } : {}),
            }),
    };
}
