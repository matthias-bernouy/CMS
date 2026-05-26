import { z } from "zod";

/** Query params for the log endpoints (base.md §10.5). All optional;
 *  strings (query string). `limit` bounded by the store. */
export const LogQuerySchema = z.object({
    kind:   z.enum(["security", "audit", "request"]).optional(),
    level:  z.enum(["debug", "info", "warn", "error"]).optional(),
    sinceTs: z.string().optional(),
    untilTs: z.string().optional(),
    limit:  z.coerce.number().int().positive().max(200).optional(),
    cursor: z.string().optional(),
});

/** `/admin/logs` additionally allows filtering by tenant (control-plane). */
export const AdminLogQuerySchema = LogQuerySchema.extend({
    tenantId: z.string().min(1).optional(),
});
