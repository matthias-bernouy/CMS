import { z } from "./zodInit";

/** `POST /api/providers` body. */
export const ImportTenantProvisionerInputSchema = z.object({
    url:  z.url().openapi({ description: "Base URL of the tenant-provisioner (no trailing slash).", example: "https://delivery.acme.com" }),
    name: z.string().min(1).max(200).optional().openapi({ description: "Optional UI label.", example: "Acme Delivery" }),
}).openapi("ImportTenantProvisionerInput");

/** Common identifier in many endpoints. */
export const ProviderIdQuerySchema = z.object({
    providerId: z.string().min(1).openapi({ example: "delivery-acme" }),
});

/** `POST /api/tenants/providers` / `PATCH /api/tenants/providers` body. */
export const ProvisionTenantOnProviderInputSchema = z.object({
    providerConfig: z.record(z.string(), z.unknown()).optional().openapi({
        description: "Opaque per-TP config blob. Each TP validates against its own zod schema.",
    }),
}).openapi("ProvisionTenantOnProviderInput");

/** Query for tenant×provider endpoints. */
export const TenantProviderQuerySchema = z.object({
    tenantId:   z.string().min(1).openapi({ example: "acme" }),
    providerId: z.string().min(1).openapi({ example: "delivery-acme" }),
});

/** Same as above + force flag for DELETE. */
export const TenantProviderDeleteQuerySchema = TenantProviderQuerySchema.extend({
    force: z.enum(["true", "false"]).optional(),
});

/** Schema for a `TenantProvisionerImport` summary (list endpoint). */
export const TenantProvisionerImportSummarySchema = z.object({
    providerId:   z.string(),
    url:          z.string(),
    name:         z.string().optional(),
    providerKind: z.string().optional(),
    iss:          z.string(),
    importedAt:   z.string(),                   // ISO date
    cachedAt:     z.string(),
}).openapi("TenantProvisionerImportSummary");

/** Full `TenantProvisionerImport` (with cached schemas). */
export const TenantProvisionerImportSchema = TenantProvisionerImportSummarySchema.extend({
    schemas: z.object({
        info:                z.record(z.string(), z.unknown()),
        metadoc:             z.record(z.string(), z.unknown()),
        jwks:                z.record(z.string(), z.unknown()),
        openapiAdmin:        z.record(z.string(), z.unknown()),
        tenantConfig:        z.record(z.string(), z.unknown()).optional(),
        tenantConfigVersion: z.string().optional(),
    }),
}).openapi("TenantProvisionerImport");

export type ImportTenantProvisionerInput          = z.infer<typeof ImportTenantProvisionerInputSchema>;
export type ProvisionTenantOnProviderInput   = z.infer<typeof ProvisionTenantOnProviderInputSchema>;
