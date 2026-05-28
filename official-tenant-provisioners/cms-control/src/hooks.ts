import type { ProviderHooks } from "@bernouy/tenant-provisioner-sdk";
import type { CmsTenantConfig } from "./tenantConfig";

/**
 * The browser-facing admin runtime the lifecycle hooks drive. Implemented at
 * the composition root (`docker/cms-tp`) by adapting `MtControlCms` — kept as
 * an injected interface so this package stays free of the runtime's heavy
 * dependencies (`@bernouy/cms` + Mongo). Authentication is CMS-owned (builtin
 * local provider + per-tenant dynamic OIDC providers stored as data); only
 * the session-signing key is platform-level, configured on the runtime.
 */
export interface CmsTenantRuntime {
    /** Mount the tenant's CMS admin + seed the initial admin. Idempotent.
     *  `initialAdminPassword` bootstraps the builtin local admin; the runtime
     *  generates one when omitted. */
    provision(input: { tenantId: string; displayName?: string; initialAdminEmail: string; initialAdminPassword?: string }): Promise<void>;
    /** Re-mount the tenant (the auth chain is captured at mount). */
    reprovision(input: { tenantId: string; displayName?: string; initialAdminEmail: string; initialAdminPassword?: string }): Promise<void>;
    /** Unmount the tenant; drop its data only when `force`. */
    deprovision(input: { tenantId: string; force: boolean }): Promise<void>;
}

export interface CmsHooksOptions {
    runtime: CmsTenantRuntime;
}

/**
 * CMS tenant lifecycle hooks (base.md §8). The SDK owns the HTTP contract,
 * registry, audit and §11 config storage; these translate the lifecycle into
 * mounting/unmounting the tenant's CMS admin through the injected runtime. All
 * idempotent (the runtime guarantees mount/unmount idempotency).
 */
export function makeCmsHooks(opts: CmsHooksOptions): ProviderHooks {
    return {
        onProvision: async ({ tenantId, displayName, providerConfig }) => {
            const cfg = providerConfig as CmsTenantConfig | undefined;
            // `initialAdminEmail` is required to seed the CMS admin — the hub
            // collects it in the create-tenant form, so always present.
            if (!cfg) {
                throw new Error("cms-control: providerConfig (initialAdminEmail) is required to provision a CMS tenant.");
            }
            await opts.runtime.provision({ tenantId, displayName, initialAdminEmail: cfg.initialAdminEmail, initialAdminPassword: cfg.initialAdminPassword });
        },
        // Only the control-plane PATCH transports `providerConfig` to onUpdate.
        // A config change requires a re-mount — the auth chain is captured when
        // the tenant is mounted.
        onUpdate: async ({ tenantId, patch }) => {
            if (patch.providerConfig === undefined) return;
            const cfg = patch.providerConfig as CmsTenantConfig;
            await opts.runtime.reprovision({ tenantId, initialAdminEmail: cfg.initialAdminEmail, initialAdminPassword: cfg.initialAdminPassword });
        },
        // `force` gates data destruction: dropping a site's content is
        // irreversible, so a non-force deprovision only unmounts.
        onDeprovision: async ({ tenantId, force }) => {
            await opts.runtime.deprovision({ tenantId, force });
        },
    };
}
