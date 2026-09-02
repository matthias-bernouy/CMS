import { jsonResponse } from "../../../http";
import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleTransferRecoveryRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/reserve_transfer_recovery" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const recoveryRequestId = String(body.p_recovery_request_id);
        let recovery = mock.tables.transfer_recovery_requests.find(
            (row) => row.recovery_request_id === recoveryRequestId,
        );
        if (!recovery) {
            const payment = mock.tables.payments.find((row) => same(row.id, body.p_payment_id));
            if (!payment) {
                return jsonResponse({ message: "not_found: payment" }, 400);
            }
            const now = "2026-07-06T12:04:00.000Z";
            recovery = mock.insertGeneric("transfer_recovery_requests", {
                payment_id: body.p_payment_id,
                recovery_request_id: recoveryRequestId,
                exposure_type: body.p_exposure_type,
                requested_amount: body.p_amount,
                allocated_amount: 0,
                confirmed_amount: 0,
                allocation_shortfall_amount: body.p_amount,
                currency: payment.currency,
                reason: body.p_reason,
                allocation_strategy: "newest_first",
                status: "reserved",
                last_error: null,
            });
            let remaining = Number(body.p_amount);
            let allocationIndex = 0;
            const transfers = mock.tables.transfers
                .filter(
                    (row) =>
                        same(row.payment_id, body.p_payment_id) &&
                        ["succeeded", "partially_reversed"].includes(String(row.status)) &&
                        typeof row.stripe_transfer_id === "string",
                )
                .sort(
                    (left, right) =>
                        String(right.created_at).localeCompare(String(left.created_at)) ||
                        Number(right.id) - Number(left.id),
                );
            for (const transfer of transfers) {
                const reserved = mock.tables.transfer_reversals
                    .filter(
                        (row) =>
                            same(row.transfer_id, transfer.id) &&
                            ["reserved", "processing", "succeeded", "manual_review"].includes(String(row.status)),
                    )
                    .reduce((sum, row) => sum + Number(row.amount), 0);
                const allocationAmount = Math.min(remaining, Math.max(0, Number(transfer.amount) - reserved));
                if (allocationAmount <= 0) {
                    continue;
                }
                allocationIndex++;
                const childKey = `${recoveryRequestId}:part:${allocationIndex}:transfer:${transfer.id}`;
                const operation = mock.insertGeneric("financial_operations", {
                    payment_id: body.p_payment_id,
                    business_key: `reversal:${body.p_payment_id}:${childKey}`,
                    operation_type: "transfer_reversal_create",
                    status: "reserved",
                    stripe_object_id: null,
                    request: {
                        recoveryRequestId,
                        reversalRequestId: childKey,
                        transferId: transfer.stripe_transfer_id,
                        amount: allocationAmount,
                        currency: payment.currency,
                        reason: body.p_reason,
                        allocationIndex,
                    },
                    response: null,
                    last_error: null,
                    attempt_count: 0,
                    next_attempt_at: null,
                    claimed_at: null,
                    completed_at: null,
                    created_at: now,
                    updated_at: now,
                });
                mock.insertGeneric("transfer_reversals", {
                    payment_id: body.p_payment_id,
                    recovery_id: recovery.id,
                    allocation_index: allocationIndex,
                    transfer_id: transfer.id,
                    operation_id: operation.id,
                    reversal_request_id: childKey,
                    stripe_transfer_reversal_id: null,
                    amount: allocationAmount,
                    currency: payment.currency,
                    reason: body.p_reason,
                    status: "reserved",
                    provider_snapshot: null,
                });
                remaining -= allocationAmount;
                if (remaining === 0 || allocationIndex === 23) {
                    break;
                }
            }
            const recoveryRef = mock.tables.transfer_recovery_requests.find((row) => same(row.id, recovery!.id));
            if (!recoveryRef) {
                throw new Error("Transfer recovery reservation disappeared");
            }
            recovery = mock.update(recoveryRef, {
                allocated_amount: Number(body.p_amount) - remaining,
                allocation_shortfall_amount: remaining,
                status: Number(body.p_amount) === remaining ? "manual_review" : "reserved",
                last_error: remaining > 0 ? "confirmed Transfers cannot cover the requested recovery" : null,
            });
        } else if (
            !same(recovery.payment_id, body.p_payment_id) ||
            !same(recovery.requested_amount, body.p_amount) ||
            recovery.exposure_type !== body.p_exposure_type ||
            recovery.reason !== body.p_reason
        ) {
            return jsonResponse({ message: "conflict: transfer recovery replay mismatch" }, 400);
        }
        const allocations = mock.tables.transfer_reversals
            .filter((row) => same(row.recovery_id, recovery!.id))
            .sort((left, right) => Number(left.allocation_index) - Number(right.allocation_index))
            .map((reversal) => ({
                reversal,
                operation: mock.tables.financial_operations.find((row) => same(row.id, reversal.operation_id)),
                transfer: mock.tables.transfers.find((row) => same(row.id, reversal.transfer_id)),
            }));
        mock.applyNextTransferReversalScenario(allocations);
        return jsonResponse({ recovery, allocations });
    }
    return null;
}
