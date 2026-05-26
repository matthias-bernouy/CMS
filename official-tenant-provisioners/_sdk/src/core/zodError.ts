import type { z } from "zod";

/** Flatten a `ZodError` to a single `path: message; …` string. Shared so
 *  `parseOrThrow` and the config parsers format issues identically (the
 *  message then goes into a typed error → RFC 7807 detail). */
export function formatZodIssues(error: z.ZodError): string {
    return error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
}
