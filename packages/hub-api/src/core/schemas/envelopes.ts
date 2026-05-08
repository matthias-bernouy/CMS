import { z } from "./zodInit";

/**
 * Wire envelope shared by every endpoint:
 *   { ok: true, data: T } | { ok: false, error: { code, message } }
 *
 * Helpers below produce schemas with the right shape for OpenAPI registration.
 */

export const HubErrorEnvelope = z.object({
    ok:    z.literal(false),
    error: z.object({
        code:    z.string(),
        message: z.string(),
    }),
}).openapi("HubErrorEnvelope");

/** Wraps a data schema in `{ ok: true, data: ... }`. Each endpoint calls this
 *  with its own data schema rather than building the envelope by hand. */
export function successEnvelope<T extends z.ZodTypeAny>(data: T) {
    return z.object({
        ok:   z.literal(true),
        data,
    });
}
