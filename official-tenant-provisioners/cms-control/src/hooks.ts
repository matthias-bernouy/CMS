import type { ProviderHooks } from "@bernouy/tenant-provisioner-sdk";
import type { CmsRepository } from "@bernouy/cms/repository";
import type { CmsTenantConfig } from "./tenantConfig";

export interface CmsHooksOptions {
    /** A repository scoped to one tenant's CMS space (Mongo collection set). */
    repoFor:    (tenantId: string) => CmsRepository;
    /** Prepare a tenant's space (e.g. create Mongo indexes). Idempotent. */
    initTenant: (tenantId: string) => Promise<void>;
    /** Destroy a tenant's space (drop its collections). Idempotent. */
    dropTenant: (tenantId: string) => Promise<void>;
}

/** Project the hub-set config onto the tenant's `system.site`. Re-spreads the
 *  current `site` so fields the CMS admin edits in-app (favicon, notFound, …)
 *  are preserved by the section-level merge. */
async function applyConfig(repo: CmsRepository, cfg: CmsTenantConfig): Promise<void> {
    const current = await repo.getSystem();
    await repo.updateSystem({
        site: {
            ...current.site,
            name:     cfg.siteName,
            host:     cfg.host,
            language: cfg.language,
            theme:    cfg.theme,
        },
    });
}

/**
 * CMS tenant lifecycle hooks (base.md §8). The SDK owns the HTTP contract,
 * registry, audit and config storage; these only reconcile the **CMS domain**
 * (the tenant's collection set + its `system` record). All idempotent.
 */
export function makeCmsHooks(opts: CmsHooksOptions): ProviderHooks {
    return {
        onProvision: async ({ tenantId, providerConfig }) => {
            await opts.initTenant(tenantId);
            const repo = opts.repoFor(tenantId);
            if (providerConfig) await applyConfig(repo, providerConfig as CmsTenantConfig);
            else await repo.getSystem();                  // lazy-create default system
        },
        // Only the control-plane PATCH transports `providerConfig` to onUpdate.
        onUpdate: async ({ tenantId, patch }) => {
            if (patch.providerConfig === undefined) return;
            await applyConfig(opts.repoFor(tenantId), patch.providerConfig as CmsTenantConfig);
        },
        // `force` gates destruction: dropping a whole site's content is
        // irreversible, so a non-force deprovision leaves the data untouched
        // (the SDK registry still records the tenant as gone).
        onDeprovision: async ({ tenantId, force }) => {
            if (force) await opts.dropTenant(tenantId);
        },
    };
}
