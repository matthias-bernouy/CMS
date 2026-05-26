import type { z } from "zod";

/**
 * Per-endpoint OpenAPI metadata. Each `api/<route>.<method>.ts` exports a
 * named `meta` of this shape; the mount step walks the folder and assembles
 * `/openapi.admin.json` (the §8 contract is frozen → SDK-generated).
 * Method + path come from the FILENAME (serveApi convention), not here.
 *
 * Errors are RFC 7807 (`ProblemSchema`), NOT the hub-api `{ok}` envelope —
 * deliberate divergence (decision 00 #1).
 */
export type ApiOperationMeta = {
    summary:      string;
    description?: string;
    operationId:  string;
    tags:         string[];
    request?: {
        body?:  z.ZodTypeAny;
        query?: z.ZodObject<z.ZodRawShape>;
    };
    responses: Record<number, { description: string; schema?: z.ZodTypeAny }>;
};
