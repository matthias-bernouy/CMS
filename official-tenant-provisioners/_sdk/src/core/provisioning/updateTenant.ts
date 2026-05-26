import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { TenantState, TenantPatch } from "src/interfaces/TenantRegistry";
import { ProvisioningError, ValidationError } from "src/core/errors";
import { formatZodIssues } from "src/core/zodError";
import { recordAudit } from "src/core/log/recordAudit";

/**
 * §8 `PATCH /admin/tenants?tenantId=`. Rotation of `issuer`/status, and
 * optionally a §11 `providerConfig` replace (base.md D11 — replace at root
 * is the CP semantic; tenant-scope PATCH uses merge instead). Invalidates
 * the state cache for the old (and new, if rotated) `iss` so the change is
 * effective immediately (§5). Audited.
 */
export async function updateTenant(
    ctx: ProvisioningContext, callerIss: string,
    tenantId: string, patch: TenantPatch,
): Promise<TenantState> {
    try {
        const before = await ctx.registry.get(tenantId);
        if (!before) throw new ProvisioningError(`unknown tenant ${tenantId}`, 404);

        // §11 pre-flight: validate providerConfig if present.
        let validatedConfig: unknown | undefined;
        if (ctx.tenantConfig && patch.providerConfig !== undefined) {
            const r = ctx.tenantConfig.zod.safeParse(patch.providerConfig);
            if (!r.success) throw new ValidationError(formatZodIssues(r.error));
            validatedConfig = r.data;
        }

        const state = await ctx.registry.patch(tenantId, patch);
        await ctx.hooks.onUpdate({ tenantId, patch });

        // §11 persist AFTER hook OK.
        if (ctx.tenantConfig && validatedConfig !== undefined) {
            await ctx.tenantConfig.store.save(tenantId, validatedConfig);
        }

        // Invalidate the cache for every iss that was or is now trusted.
        for (const iss of new Set([...before.issuers, ...state.issuers])) ctx.invalidate(iss);

        await recordAudit(ctx.audit, ctx.now, {
            callerIss, tenantId, operation: "update", result: "ok",
        });
        return state;
    } catch (e) {
        await recordAudit(ctx.audit, ctx.now, {
            callerIss, tenantId, operation: "update",
            result: "error", detail: e instanceof Error ? e.message : String(e),
        });
        if (e instanceof ProvisioningError) throw e;
        if (e instanceof ValidationError) throw e;
        throw new ProvisioningError("update failed", 502);
    }
}
