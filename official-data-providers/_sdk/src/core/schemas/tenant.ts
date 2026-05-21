import { z } from "zod";

/** `POST /admin/tenants` body (base.md §8 + §11). `issuers` may be empty
 *  (an issuer-only provider that trusts no external IdP). */
export const TenantUpsertSchema = z.object({
    tenantId:    z.string().min(1),
    issuers:     z.array(z.string().url()).default([]),
    displayName: z.string().optional(),
    plan:        z.string().optional(),
    /** §11 opaque provider-specific config — validated by the provider. */
    providerConfig: z.unknown().optional(),
});

/** `PATCH /admin/tenants?tenantId=` body. */
export const TenantPatchSchema = z.object({
    issuers:     z.array(z.string().url()).optional(),
    status:      z.enum(["active", "suspended"]).optional(),
    displayName: z.string().optional(),
    plan:        z.string().optional(),
    providerConfig: z.unknown().optional(),
});

export const TenantIdQuerySchema = z.object({ tenantId: z.string().min(1) });

/** `DELETE /admin/tenants?tenantId=&force=` query (strings). */
export const DeleteQuerySchema = z.object({
    tenantId: z.string().min(1),
    force:    z.enum(["true", "false"]).optional(),
});

export const TenantStateSchema = z.object({
    tenantId:    z.string(),
    issuers:     z.array(z.string()),
    role:        z.literal("tenant"),
    status:      z.enum(["active", "suspended"]),
    displayName: z.string().optional(),
    plan:        z.string().optional(),
});

export const TenantListSchema = z.object({ tenants: z.array(TenantStateSchema) });

/** RFC 7807 problem (base.md §6) — the error response shape in `meta`. */
export const ProblemSchema = z.object({
    type:     z.string(),
    title:    z.string(),
    status:   z.number(),
    detail:   z.string(),
    instance: z.string(),
});
