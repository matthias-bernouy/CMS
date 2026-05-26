import type { ProviderHooks } from "@bernouy/tenant-provisioner-sdk";
import type { CmsTenantConfig } from "./tenantConfig";

/** OIDC for the tenant's admin space — assembled from the §11 config. AuthN
 *  only: a shared realm/client. Authorization (who is admin) lives in the CMS,
 *  bootstrapped from `initialAdminEmail`. */
export interface CmsAdminOidc {
    issuer:       string;
    clientId:     string;
    clientSecret: string;
}

/**
 * The browser-facing admin runtime the lifecycle hooks drive. Implemented at
 * the composition root (`docker/cms-tp`) by adapting `MtControlCms` — kept as
 * an injected interface so this package stays free of the runtime's heavy
 * dependencies (keycloak / composite-auth).
 */
export interface CmsTenantRuntime {
    /** Mount the tenant's CMS admin + seed the initial admin. Idempotent. */
    provision(input: { tenantId: string; displayName?: string; oidc: CmsAdminOidc; initialAdminEmail: string }): Promise<void>;
    /** Re-mount after an OIDC change (the auth chain is captured at mount). */
    reprovision(input: { tenantId: string; displayName?: string; oidc: CmsAdminOidc; initialAdminEmail: string }): Promise<void>;
    /** Unmount the tenant; drop its data only when `force`. */
    deprovision(input: { tenantId: string; force: boolean }): Promise<void>;
}

export interface CmsHooksOptions {
    runtime: CmsTenantRuntime;
}

function toOidc(cfg: CmsTenantConfig): CmsAdminOidc {
    return { issuer: cfg.oidcIssuer, clientId: cfg.oidcClientId, clientSecret: cfg.oidcClientSecret };
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
            // Admin OIDC + initial admin are required to mount the CMS admin —
            // the hub collects them in the create-tenant form, so always present.
            if (!cfg) {
                throw new Error("cms-control: providerConfig (admin OIDC + initialAdminEmail) is required to provision a CMS tenant.");
            }
            await opts.runtime.provision({ tenantId, displayName, oidc: toOidc(cfg), initialAdminEmail: cfg.initialAdminEmail });
        },
        // Only the control-plane PATCH transports `providerConfig` to onUpdate.
        // An OIDC change requires a re-mount — the per-tenant auth chain is
        // captured when the tenant is mounted.
        onUpdate: async ({ tenantId, patch }) => {
            if (patch.providerConfig === undefined) return;
            const cfg = patch.providerConfig as CmsTenantConfig;
            await opts.runtime.reprovision({ tenantId, oidc: toOidc(cfg), initialAdminEmail: cfg.initialAdminEmail });
        },
        // `force` gates data destruction: dropping a site's content is
        // irreversible, so a non-force deprovision only unmounts.
        onDeprovision: async ({ tenantId, force }) => {
            await opts.runtime.deprovision({ tenantId, force });
        },
    };
}
