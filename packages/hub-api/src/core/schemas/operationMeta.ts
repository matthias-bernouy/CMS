import type { z } from "./zodInit";

/**
 * Per-endpoint OpenAPI metadata. Each `api/<route>.<method>.ts` file exports
 * a named `meta` of this shape; the generator script at
 * `scripts/generate-openapi.ts` walks the folder and assembles the full spec.
 *
 * The HTTP method + path come from the FILENAME (same convention as `serveApi`),
 * so they are NOT in this type.
 */
export type ApiOperationMeta = {
    summary:      string;
    description?: string;
    operationId:  string;
    tags:         string[];
    request?:     {
        body?:  z.ZodTypeAny;
        // OpenAPI's `parameters` come from a ZodObject — each top-level field becomes a query param.
        query?: z.ZodObject<z.ZodRawShape>;
    };
    responses: Record<number, { description: string; schema: z.ZodTypeAny }>;
    /** Default true — flip false on public endpoints (e.g. `/health`). */
    requiresAuth?: boolean;
};
