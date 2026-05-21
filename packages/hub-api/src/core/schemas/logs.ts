import { z } from "./zodInit";

/** Shared log filters (mirror the DP's `/admin/logs`, base.md §10.5). */
const LogFiltersSchema = z.object({
    kind:    z.enum(["security", "audit", "request"]).optional(),
    level:   z.enum(["debug", "info", "warn", "error"]).optional(),
    sinceTs: z.string().optional(),
    untilTs: z.string().optional(),
    limit:   z.coerce.number().int().positive().max(200).optional(),
    cursor:  z.string().optional(),
});

export const ProviderLogsQuerySchema = LogFiltersSchema.extend({
    providerId: z.string().min(1),
});

export const TenantLogsQuerySchema = LogFiltersSchema.extend({
    tenantId: z.string().min(1),
});

// Namespace logs aggregate across tenants → no resumable cursor.
export const NamespaceLogsQuerySchema = LogFiltersSchema.omit({ cursor: true }).extend({
    namespaceId: z.string().min(1),
});

const LogRecordSchema = z.object({
    kind:          z.string(),
    level:         z.string(),
    event:         z.string(),
    tenantId:      z.string().nullable(),
    actor:         z.string(),
    visibility:    z.string(),
    requestId:     z.string(),
    outcome:       z.string().optional(),
    iss:           z.string().optional(),
    sub:           z.string().optional(),
    ctx:           z.record(z.string(), z.unknown()).optional(),
    schemaVersion: z.string(),
    ts:            z.string(),
    providerId:    z.string(),
}).openapi("LogRecord");

export const LogPageSchema = z.object({
    items:      z.array(LogRecordSchema),
    nextCursor: z.string().optional(),
    // Set only by namespace logs: providerIds whose fetch failed (partial result).
    failedProviders: z.array(z.string()).optional(),
}).openapi("LogPage");

export type ProviderLogsQuery  = z.infer<typeof ProviderLogsQuerySchema>;
export type TenantLogsQuery    = z.infer<typeof TenantLogsQuerySchema>;
export type NamespaceLogsQuery = z.infer<typeof NamespaceLogsQuerySchema>;
