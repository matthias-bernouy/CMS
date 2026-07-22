import { readFinancialOperationDashboardPage } from "../../db/dashboard-reads.ts";
import { callRpcObject, getRowByField, listRows } from "../../db/postgrest.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import { publicFinancialOperation } from "../../domain/admin/financial-operation.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredInteger, requiredString } from "../../http/body.ts";
import { HttpError } from "../../http/errors.ts";
import { queryLimit, requiredQueryInteger, searchPattern } from "../../http/query.ts";
import { json } from "../../http/responses.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function listFinancialOperations(request: Request): Promise<Response> {
    const actor = requireDashboardAdmin(request);
    const rows = await readFinancialOperationDashboardPage(request, actor);
    const operations = rows.map((row) =>
        publicFinancialOperation(
            row.operation as unknown as FinancialOperationRow,
            row.client_reference_id === null
                ? null
                : {
                      client_reference_id: row.client_reference_id,
                      currency: row.payment_currency ?? "",
                  },
        ),
    );
    return json({ operations, total: operations.length });
}

export async function listProviderExceptions(request: Request): Promise<Response> {
    requireDashboardAdmin(request);
    const params = new URL(request.url).searchParams;
    const query = new URLSearchParams({
        select: "*",
        order: "detected_at.desc",
        limit: String(queryLimit(params.get("limit"))),
    });
    const search = searchPattern(params.get("q"));
    if (search) {
        query.set("or", `(exception_type.ilike.${search},message.ilike.${search})`);
    }
    const status = params.get("status")?.trim();
    if (status) {
        query.set("status", `eq.${status}`);
    }
    const exceptions = await listRows<JsonRecord>(`provider_exceptions?${query.toString()}`);
    return json({ exceptions, total: exceptions.length });
}

export async function getProviderException(request: Request): Promise<Response> {
    requireDashboardAdmin(request);
    const exceptionId = requiredQueryInteger(request, "id");
    const exception = await getRowByField<JsonRecord>("provider_exceptions", "id", String(exceptionId), "*");
    if (!exception) {
        throw new HttpError(404, "provider exception not found");
    }
    return json(exception);
}

export async function requeueCommerceProjection(request: Request): Promise<Response> {
    const { userId } = requireDashboardAdmin(request);
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["projectionId", "expectedInterventionRevision", "reason"]);
    const result = await callRpcObject<JsonRecord>("requeue_commerce_projection_outbox", {
        p_projection_id: requiredInteger(body, "projectionId"),
        p_expected_intervention_revision: requiredInteger(body, "expectedInterventionRevision"),
        p_actor_id: userId,
        p_reason: requiredString(body, "reason", 2000),
    });
    return json({
        projectionId: result.id,
        projectionStatus: result.projection_status,
        interventionRevision: result.intervention_revision,
        nextAttemptAt: result.next_attempt_at,
    });
}
