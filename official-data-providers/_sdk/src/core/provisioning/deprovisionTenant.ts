import type { ProvisioningContext } from "src/types/ProvisioningContext";
import { ProvisioningError } from "src/core/errors";
import { recordAudit } from "src/core/log/recordAudit";

/**
 * §8 `DELETE /admin/tenants?tenantId=&force=`. Hook **first** (purge or
 * schedule per the provider's default policy; `force` ⇒ immediate
 * irreversible) then drop the trust binding — a failed purge keeps the
 * tenant known for retry/reconciliation. Access survives ≤ 1 cache TTL (§5);
 * `invalidate` shortens that. Audited.
 */
export async function deprovisionTenant(
    ctx: ProvisioningContext, callerIss: string,
    tenantId: string, force: boolean,
): Promise<void> {
    try {
        const before = await ctx.registry.get(tenantId);
        await ctx.hooks.onDeprovision({ tenantId, force });
        await ctx.registry.remove(tenantId, { force });
        if (before) for (const iss of before.issuers) ctx.invalidate(iss);

        // §11 — drop the tenant config after the hook OK + registry remove.
        // Idempotent (drop is a no-op if absent).
        if (ctx.tenantConfig) {
            await ctx.tenantConfig.store.drop(tenantId);
        }

        await recordAudit(ctx.audit, ctx.now, {
            callerIss, tenantId, operation: "deprovision",
            result: "ok", detail: force ? "force" : "policy",
        });
    } catch (e) {
        await recordAudit(ctx.audit, ctx.now, {
            callerIss, tenantId, operation: "deprovision",
            result: "error", detail: e instanceof Error ? e.message : String(e),
        });
        if (e instanceof ProvisioningError) throw e;
        throw new ProvisioningError("deprovision failed", 502);
    }
}
