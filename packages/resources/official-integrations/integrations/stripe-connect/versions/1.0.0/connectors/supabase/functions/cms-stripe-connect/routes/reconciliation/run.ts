import { requireCmsRequest } from "../../http/auth.ts";
import { assertAllowedKeys, optionalPositiveInteger, readJsonObject, requiredString } from "../../http/body.ts";
import { json } from "../../http/responses.ts";
import type { ExecuteProviderReconciliationRun } from "../../workflows/reconciliation/run.ts";
import { publicReconciliationRun } from "./presentation.ts";

type ReconciliationRunRouteDependencies = {
    executeProviderReconciliationRun: ExecuteProviderReconciliationRun;
};

export function createRunProviderReconciliation({
    executeProviderReconciliationRun,
}: ReconciliationRunRouteDependencies): (request: Request) => Promise<Response> {
    return async function runProviderReconciliation(request) {
        requireCmsRequest(request, { requireUser: false });
        const body = await readJsonObject(request);
        assertAllowedKeys(body, ["runKey", "limit"]);
        const runKey = requiredString(body, "runKey", 200);
        const limit = Math.min(optionalPositiveInteger(body, "limit") ?? 50, 200);
        const result = await executeProviderReconciliationRun(runKey, limit);
        return json(await publicReconciliationRun(result.run, limit, `commerce:${runKey}`));
    };
}
