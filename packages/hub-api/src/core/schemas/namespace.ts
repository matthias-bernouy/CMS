import { z } from "./zodInit";

// RFC 1123 label constraints — keeps URL paths + DP tenant ids consistent.
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const NamespaceIdSchema = z.string().regex(LABEL_RE).openapi({
    description: "URL-safe id (lowercase + digits + dash, ≤63 chars).",
    example:     "acme",
});

export const TenantIdSchema = z.string().regex(LABEL_RE).openapi({
    description: "Globally-unique tenant id (lowercase + digits + dash, ≤63 chars). Sent to the DP as `tenantId`.",
    example:     "acme-addresses-fr-a1b2c3d4",
});

export const CreateNamespaceInputSchema = z.object({
    namespaceId: NamespaceIdSchema,
    displayName: z.string().min(1).max(200).openapi({ example: "ACME Corp" }),
    description: z.string().max(2000).optional(),
}).openapi("CreateNamespaceInput");

export const UpdateNamespaceInputSchema = z.object({
    displayName: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
}).openapi("UpdateNamespaceInput");

export const NamespaceIdQuerySchema = z.object({
    namespaceId: NamespaceIdSchema,
});

const IssuersSchema = z.array(z.string().url()).openapi({
    description: "Trusted issuers granted tenant-role on this DP. May be empty (issuers can be attached later). Each iss is globally unique across tenants.",
});

/** Body for `POST /api/namespaces/tenants?namespaceId=&providerId=`. */
export const CreateTenantInputSchema = z.object({
    tenantId:       TenantIdSchema.optional().openapi({ description: "Optional explicit id; generated from the providerId when omitted." }),
    displayName:    z.string().min(1).max(200).optional(),
    issuers:        IssuersSchema.default([]),
    providerConfig: z.record(z.string(), z.unknown()).optional(),
}).openapi("CreateTenantInput");

/** Body for `PATCH /api/namespaces/tenants?tenantId=`. */
export const UpdateTenantInputSchema = z.object({
    displayName:    z.string().min(1).max(200).optional(),
    issuers:        IssuersSchema.optional(),
    providerConfig: z.record(z.string(), z.unknown()).optional(),
    status:         z.enum(["active", "suspended"]).optional(),
}).openapi("UpdateTenantInput");

export const TenantIdQuerySchema = z.object({
    tenantId: TenantIdSchema,
});

/** `?force=` (string) appended to DELETE tenant. */
export const TenantDeleteQuerySchema = TenantIdQuerySchema.extend({
    force: z.enum(["true", "false"]).optional(),
});

// ── Output projections ─────────────────────────────────────────────────

export const NamespaceSchema = z.object({
    namespaceId: z.string(),
    displayName: z.string(),
    description: z.string().optional(),
    createdAt:   z.string(),  // ISO
}).openapi("Namespace");

export const TenantSchema = z.object({
    tenantId:    z.string(),
    namespaceId: z.string(),
    providerId:  z.string(),
    displayName: z.string().optional(),
    issuers:     z.array(z.string()),
    config:      z.record(z.string(), z.unknown()).optional(),
    status:      z.enum(["active", "suspended"]),
    activatedAt: z.string(),
}).openapi("Tenant");

export type CreateNamespaceInput = z.infer<typeof CreateNamespaceInputSchema>;
export type UpdateNamespaceInput = z.infer<typeof UpdateNamespaceInputSchema>;
export type CreateTenantInput    = z.infer<typeof CreateTenantInputSchema>;
export type UpdateTenantInput    = z.infer<typeof UpdateTenantInputSchema>;
