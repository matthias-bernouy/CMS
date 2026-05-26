import { z } from "zod";

/** Validates a `LogInput` (base.md §10.2). `tenantId` is mandatory as a
 *  field; its value may be `null`. */
export const LogInputSchema = z.object({
    kind:       z.enum(["security", "audit", "request"]),
    level:      z.enum(["debug", "info", "warn", "error"]),
    event:      z.string().min(1),
    tenantId:   z.string().min(1).nullable(),
    actor:      z.enum(["anonymous", "tenant", "control-plane", "system"]),
    visibility: z.enum(["control-plane", "tenant", "both"]),
    requestId:  z.string().min(1).optional(),
    outcome:    z.enum(["allow", "deny", "ok", "error"]).optional(),
    iss:        z.string().optional(),
    sub:        z.string().optional(),
    ctx:        z.record(z.string(), z.unknown()).optional(),
});

/** Persisted `LogRecord` (base.md §10.2). `LogInput` + the fields the
 *  Recorder fills in (`schemaVersion`, `ts`, `providerId`, `requestId`). */
export const LogRecordSchema = LogInputSchema.extend({
    schemaVersion: z.string(),
    ts:            z.string(),         // ISO 8601 ms, UTC
    providerId:    z.string(),
    requestId:     z.string().min(1),
});

/** Bounded page of records (base.md §10.5). `nextCursor` absent ⇒ end. */
export const LogPageSchema = z.object({
    items:       z.array(LogRecordSchema),
    nextCursor:  z.string().optional(),
});
