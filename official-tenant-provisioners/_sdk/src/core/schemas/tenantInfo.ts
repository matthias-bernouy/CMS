import { z } from "zod";

/** One TP-computed fact about a tenant (base.md §8 — read-only, not §11 config). */
export const TenantInfoFieldSchema = z.object({
    label: z.string(),
    value: z.string(),
    kind:  z.enum(["text", "url", "code"]).optional(),
});

export const TenantInfoSchema = z.object({
    fields: z.array(TenantInfoFieldSchema),
});

export const TenantInfoQuerySchema = z.object({
    tenantId: z.string().min(1),
});
