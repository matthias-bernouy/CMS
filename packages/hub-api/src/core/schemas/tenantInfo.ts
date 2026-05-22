import { z } from "./zodInit";

const TenantInfoFieldSchema = z.object({
    label: z.string(),
    value: z.string(),
    kind:  z.enum(["text", "url", "code"]).optional(),
}).openapi("TenantInfoField");

export const TenantInfoSchema = z.object({
    fields: z.array(TenantInfoFieldSchema),
}).openapi("TenantInfo");

export const TenantInfoQuerySchema = z.object({
    tenantId: z.string().min(1),
});
