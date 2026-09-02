import { jsonResponse } from "../../../http";
import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleOperationReadRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/read_financial_operation_recovery_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const copy = (row: JsonRecord | undefined): JsonRecord | null => (row ? { ...row } : null);
        return jsonResponse([
            {
                payment: copy(mock.tables.payments.find((row) => same(row.id, body.p_payment_id))),
                transfer: copy(mock.tables.transfers.find((row) => same(row.operation_id, body.p_operation_id))),
                transfer_reversal: copy(
                    mock.tables.transfer_reversals.find((row) => same(row.operation_id, body.p_operation_id)),
                ),
                transfer_recovery: copy(
                    mock.tables.transfer_recovery_requests.find(
                        (row) => row.recovery_request_id === body.p_recovery_request_id,
                    ),
                ),
                refund: copy(mock.tables.refunds.find((row) => same(row.operation_id, body.p_operation_id))),
            },
        ]);
    }
    if (table === "rpc/ack_commerce_projection_outbox" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const row = mock.tables.commerce_projection_outbox.find(
            (candidate) =>
                same(candidate.id, body.p_projection_id) &&
                candidate.claim_token === body.p_claim_token &&
                candidate.projection_status === "leased",
        );
        if (!row) {
            return jsonResponse({ message: "conflict: projection lease is no longer valid" }, 400);
        }
        const acknowledged = mock.update(row, {
            projection_status: "succeeded",
            projected_at: new Date().toISOString(),
            claim_owner: null,
            claim_token: null,
            claimed_at: null,
            next_attempt_at: null,
            last_error: null,
        });
        const exception = mock.tables.provider_exceptions.find(
            (candidate) => candidate.deduplication_key === `commerce-projection:${row.id}`,
        );
        if (exception) {
            mock.update(exception, {
                status: "resolved",
                resolved_at: new Date().toISOString(),
                resolved_by: "commerce-projection-ack",
            });
        }
        return jsonResponse(acknowledged);
    }
    if (table === "rpc/fail_commerce_projection_outbox" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const row = mock.tables.commerce_projection_outbox.find(
            (candidate) =>
                same(candidate.id, body.p_projection_id) &&
                candidate.claim_token === body.p_claim_token &&
                candidate.projection_status === "leased",
        );
        if (!row) {
            return jsonResponse({ message: "conflict: projection lease is no longer valid" }, 400);
        }
        const failed = mock.update(row, {
            projection_status: Number(row.attempt_count) >= 5 ? "manual_review" : "retry",
            next_attempt_at: Number(row.attempt_count) >= 5 ? null : new Date(Date.now() + 60_000).toISOString(),
            claim_owner: null,
            claim_token: null,
            claimed_at: null,
            last_error: body.p_error,
        });
        if (failed.projection_status === "manual_review") {
            const values = {
                deduplication_key: `commerce-projection:${row.id}`,
                payment_id: row.payment_id,
                operation_id: row.operation_id,
                exception_type: "commerce_projection_delivery_failed",
                severity: "critical",
                status: "open",
                message: "Commerce projection exhausted automatic delivery retries",
                details: {
                    projectionId: row.id,
                    projectionKey: row.projection_key,
                    projectionKind: row.projection_kind,
                    attemptCount: row.attempt_count,
                    interventionRevision: row.intervention_revision ?? 0,
                    lastError: row.last_error,
                },
            };
            const existing = mock.tables.provider_exceptions.find(
                (candidate) => candidate.deduplication_key === values.deduplication_key,
            );
            if (existing) {
                mock.update(existing, values);
            } else {
                mock.insertGeneric("provider_exceptions", values);
            }
        }
        return jsonResponse(failed);
    }
    if (table === "rpc/requeue_commerce_projection_outbox" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const row = mock.tables.commerce_projection_outbox.find((candidate) =>
            same(candidate.id, body.p_projection_id),
        );
        if (!row) {
            return jsonResponse({ message: "not_found: Commerce projection" }, 400);
        }
        if (Number(row.intervention_revision ?? 0) !== Number(body.p_expected_intervention_revision)) {
            return jsonResponse({ message: "conflict: stale Commerce projection intervention revision" }, 400);
        }
        if (row.projection_status !== "manual_review") {
            return jsonResponse({ message: "conflict: Commerce projection is not awaiting Finance intervention" }, 400);
        }
        const revision = Number(row.intervention_revision ?? 0) + 1;
        const requeued = mock.update(row, {
            projection_status: "retry",
            attempt_count: 0,
            next_attempt_at: new Date().toISOString(),
            claim_owner: null,
            claim_token: null,
            claimed_at: null,
            intervention_revision: revision,
            last_intervention_at: new Date().toISOString(),
            last_intervention_by: body.p_actor_id,
            last_intervention_reason: body.p_reason,
        });
        mock.insertGeneric("commerce_projection_interventions", {
            projection_id: row.id,
            intervention_revision: revision,
            action: "requeue",
            actor_id: body.p_actor_id,
            reason: body.p_reason,
            previous_status: "manual_review",
            next_status: "retry",
        });
        return jsonResponse(requeued);
    }
    return null;
}
