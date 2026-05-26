import type { ProvisioningContext } from "src/types/ProvisioningContext";
import type { TenantState, TenantUpsert } from "src/interfaces/TenantRegistry";
import { ProvisioningError, ValidationError } from "src/core/errors";
import { formatZodIssues } from "src/core/zodError";
import { recordAudit } from "src/core/log/recordAudit";

/**
 * §8 `POST /admin/tenants`. Idempotent on `tenantId` (registry enforces;
 * conflicting issuer → 409). On hook failure, **best-effort rollback** of a
 * fresh create only (never destroy a pre-existing live tenant). Always
 * audited (ok/error).
 *
 * §11 — if a tenantConfig is wired, validates `providerConfig` (zod) BEFORE
 * the hook, then persists via `store.save` AFTER the hook succeeds.
 * Validation errors → 400; hook errors → 502 (with rollback as above).
 */
export async function provisionTenant(
    ctx: ProvisioningContext, callerIss: string, input: TenantUpsert,
): Promise<TenantState> {
    try {
        // §11 pre-flight: validate the providerConfig before any side-effect.
        // Without a tenantConfig (provider declared no schema), pass the blob
        // through to the hook as-is (still opaque) — the hook may use it or
        // ignore it, but the SDK does not persist it.
        let validatedConfig: unknown | undefined = input.providerConfig;
        if (ctx.tenantConfig && input.providerConfig !== undefined) {
            const r = ctx.tenantConfig.zod.safeParse(input.providerConfig);
            if (!r.success) throw new ValidationError(formatZodIssues(r.error));
            validatedConfig = r.data;
        }

        const existed = await ctx.registry.get(input.tenantId);
        const state = await ctx.registry.upsert(input); // throws 409 on iss conflict
        try {
            await ctx.hooks.onProvision({
                tenantId: input.tenantId, issuers: state.issuers,
                ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
                ...(input.plan        !== undefined ? { plan: input.plan }               : {}),
                ...(validatedConfig   !== undefined ? { providerConfig: validatedConfig } : {}),
            });
            // §11 persist AFTER hook OK — transactional ordering.
            if (ctx.tenantConfig && validatedConfig !== undefined) {
                await ctx.tenantConfig.store.save(input.tenantId, validatedConfig);
            }
        } catch (hookErr) {
            if (!existed) await ctx.registry.remove(input.tenantId, { force: true });
            throw hookErr;
        }
        for (const iss of state.issuers) ctx.invalidate(iss);
        await recordAudit(ctx.audit, ctx.now, {
            callerIss, tenantId: input.tenantId, operation: "provision", result: "ok",
        });
        return state;
    } catch (e) {
        await recordAudit(ctx.audit, ctx.now, {
            callerIss, tenantId: input.tenantId, operation: "provision",
            result: "error", detail: e instanceof Error ? e.message : String(e),
        });
        if (e instanceof ProvisioningError) throw e;
        if (e instanceof ValidationError) throw e;
        throw new ProvisioningError("provision failed", 502);
    }
}
