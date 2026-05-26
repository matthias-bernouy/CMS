import type { LogContext } from "src/types/SdkContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { LogQuerySchema } from "src/core/schemas/logQuery";
import { LogPageSchema } from "src/core/schemas/logRecord";
import { ProblemSchema } from "src/core/schemas/tenant";
import { parseOrThrow } from "src/core/http/parse";
import { getRequestAuth } from "src/core/http/requestAuth";
import { AuthError } from "src/core/errors";
import { readTenantLogs } from "src/core/log/readLogs";

export const meta: ApiOperationMeta = {
    summary:     "Read this tenant's logs (redacted)",
    description: "base.md §10.3/§10.5. `tenantId` is DERIVED from the token, never a parameter. Security/cross-tenant records are not returned.",
    operationId: "tenantReadLogs",
    tags:        ["logs"],
    request:     { query: LogQuerySchema },
    responses: {
        200: { description: "Bounded, redacted log page", schema: LogPageSchema },
        400: { description: "Invalid query",              schema: ProblemSchema },
    },
};

export default async function handle(req: Request, ctx: LogContext): Promise<Response> {
    const auth = getRequestAuth(req);
    const tenantId = auth.tenant?.tenantId;
    if (!tenantId) throw new AuthError();           // plane-2 token must resolve a tenant

    // `tenantId` comes from the token ONLY — any query param is ignored.
    const q = parseOrThrow(LogQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
    return Response.json(await readTenantLogs(ctx.store, tenantId, q));
}
