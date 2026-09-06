import { boundedInteger, json, methodNotAllowed, requestBody } from "../http.ts";
import { rpcRecord } from "../rest.ts";

export async function handleSystemRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/system/health") {
        if (request.method !== "GET") {
            return methodNotAllowed("GET");
        }
        let healthy = false;
        try {
            await rpcRecord("list_managed_forms", { p_limit: 1, p_offset: 0 });
            healthy = true;
        } catch {
            /* Surface storage failure as a structured health check. */
        }
        return json({
            schemaVersion: 1,
            configuration: { savedRevision: null, appliedRevision: null },
            status: healthy ? "ready" : "blocked",
            checkedAt: new Date().toISOString(),
            checks: [
                {
                    id: "storage",
                    status: healthy ? "ok" : "error",
                    message: healthy ? "Forms storage is reachable." : "Forms storage is unavailable.",
                },
            ],
        });
    }
    if (route === "/system/retention") {
        if (request.method !== "POST") {
            return methodNotAllowed("POST");
        }
        const body = await requestBody(request);
        return json(
            await rpcRecord("purge_expired_submissions", {
                p_retention_days: boundedInteger(body.retentionDays, "retentionDays", 0, 1, 3650),
                p_batch_size: boundedInteger(body.batchSize, "batchSize", 500, 1, 2000),
            }),
        );
    }
    return null;
}
