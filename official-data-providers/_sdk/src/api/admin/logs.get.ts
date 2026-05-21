import type { LogContext } from "src/types/SdkContext";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { AdminLogQuerySchema } from "src/core/schemas/logQuery";
import { LogPageSchema } from "src/core/schemas/logRecord";
import { ProblemSchema } from "src/core/schemas/tenant";
import { parseOrThrow } from "src/core/http/parse";
import { readAdminLogs } from "src/core/log/readLogs";

export const meta: ApiOperationMeta = {
    summary:     "Read logs (control-plane, raw, all tenants)",
    description: "base.md §10.5. Filters tenantId/kind/level/time; bounded pagination (no dump).",
    operationId: "adminReadLogs",
    tags:        ["logs"],
    request:     { query: AdminLogQuerySchema },
    responses: {
        200: { description: "Bounded, raw log page", schema: LogPageSchema },
        400: { description: "Invalid query",         schema: ProblemSchema },
    },
};

export default async function handle(req: Request, ctx: LogContext): Promise<Response> {
    const q = parseOrThrow(AdminLogQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
    return Response.json(await readAdminLogs(ctx.store, q));
}
