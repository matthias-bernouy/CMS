import type { z } from "zod";
import { ValidationError } from "src/core/errors";
import { formatZodIssues } from "src/core/zodError";

/** zod parse → typed value, or `ValidationError` (400, mapped to RFC 7807). */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
    const r = schema.safeParse(data);
    if (!r.success) throw new ValidationError(formatZodIssues(r.error));
    return r.data;
}

export async function jsonBody(req: Request): Promise<unknown> {
    try { return await req.json(); }
    catch { throw new ValidationError("invalid JSON body"); }
}
