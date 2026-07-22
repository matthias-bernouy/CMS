import { jsonResponse } from "../../../http";
import { asRecord, same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handlePaymentOperationRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (
        (table === "rpc/reserve_financial_operation" || table === "rpc/reserve_payment_cancellation_operation") &&
        method === "POST"
    ) {
        let body = JSON.parse(await request.text()) as JsonRecord;
        let cancellationPayment: JsonRecord | undefined;
        if (table === "rpc/reserve_payment_cancellation_operation") {
            await mock.waitForPostgrestRead("payments");
            const payment = mock.tables.payments.find((row) => same(row.id, body.p_payment_id));
            if (!payment || payment.client_reference_id !== body.p_client_reference_id) {
                return jsonResponse(
                    {
                        message: "conflict: payment cancellation lifecycle guard does not match provider payment truth",
                    },
                    400,
                );
            }
            cancellationPayment = structuredClone(payment);
            body = { ...body, p_operation_type: "payment_intent_cancel" };
        }
        if (body.p_operation_type === "payment_intent_cancel" && mock.failNextPaymentCancellationReservation) {
            mock.failNextPaymentCancellationReservation = false;
            return jsonResponse({ message: "conflict: simulated payment cancellation reservation failure" }, 400);
        }
        const businessKey = String(body.p_business_key);
        const existing = mock.tables.financial_operations.find((row) => row.business_key === businessKey);
        if (existing) {
            return jsonResponse(cancellationPayment ? { payment: cancellationPayment, operation: existing } : existing);
        }
        const operationRequest = asRecord(body.p_request);
        if (
            body.p_operation_type === "refund_create" &&
            mock.inFlightTransferBeforeRefund &&
            same(mock.inFlightTransferBeforeRefund.paymentId, body.p_payment_id)
        ) {
            const payment = mock.tables.payments.find((row) => same(row.id, body.p_payment_id));
            const inFlight = mock.inFlightTransferBeforeRefund;
            mock.inFlightTransferBeforeRefund = null;
            mock.insertGeneric("transfers", {
                payment_id: body.p_payment_id,
                operation_id: mock.nextRowId++,
                release_authorization_id: `in-flight-before-refund-${body.p_payment_id}`,
                release_kind: "initial",
                stripe_transfer_id: null,
                source_charge_id: payment?.stripe_charge_id,
                destination_account_id: payment?.seller_stripe_account_id,
                transfer_group: payment?.transfer_group,
                amount: inFlight.amount,
                currency: payment?.currency,
                status: "processing",
                provider_snapshot: null,
            });
        }
        if (body.p_operation_type === "refund_create") {
            const unresolved = mock.tables.financial_operations.some(
                (row) =>
                    same(row.payment_id, body.p_payment_id) &&
                    row.operation_type === "refund_create" &&
                    ["reserved", "processing", "manual_review"].includes(String(row.status)),
            );
            if (unresolved) {
                return jsonResponse(
                    { message: "conflict: another refund is awaiting terminal provider confirmation" },
                    400,
                );
            }
            const payment = mock.tables.payments.find((row) => same(row.id, body.p_payment_id));
            const priorReduction = mock.tables.financial_operations
                .filter(
                    (row) =>
                        same(row.payment_id, body.p_payment_id) &&
                        row.operation_type === "refund_create" &&
                        row.status !== "failed",
                )
                .reduce((sum, row) => sum + Number(asRecord(row.request).sellerEntitlementReductionAmount ?? 0), 0);
            const expectedAuthorized =
                Number(payment?.seller_transfer_amount ?? 0) -
                priorReduction -
                Number(operationRequest.sellerEntitlementReductionAmount ?? 0);
            const transferred = mock.tables.transfers
                .filter(
                    (row) =>
                        same(row.payment_id, body.p_payment_id) &&
                        ["reserved", "processing", "succeeded", "partially_reversed", "reversed"].includes(
                            String(row.status),
                        ),
                )
                .reduce((sum, row) => sum + Number(row.amount), 0);
            const reversed = mock.tables.transfer_reversals
                .filter((row) => same(row.payment_id, body.p_payment_id) && row.status === "succeeded")
                .reduce((sum, row) => sum + Number(row.amount), 0);
            if (
                expectedAuthorized !== Number(operationRequest.authorizedSellerAmount) ||
                transferred - reversed > expectedAuthorized
            ) {
                return jsonResponse(
                    { message: "conflict: required Transfer Reversal is not confirmed or a Transfer is in flight" },
                    400,
                );
            }
        }
        const now = "2026-07-06T12:04:00.000Z";
        const operation = {
            id: mock.nextRowId++,
            payment_id: body.p_payment_id,
            business_key: businessKey,
            operation_type: body.p_operation_type,
            status: "reserved",
            stripe_object_id: null,
            request: body.p_request,
            response: null,
            last_error: null,
            attempt_count: 0,
            next_attempt_at: null,
            created_at: now,
            updated_at: now,
        };
        if (body.p_operation_type === "payment_intent_create" && mock.nextPaymentIntentOperationSucceeded) {
            mock.nextPaymentIntentOperationSucceeded = false;
            const payment = mock.tables.payments.find((row) => same(row.id, body.p_payment_id));
            if (!payment) {
                throw new Error(`unknown payment ${String(body.p_payment_id)}`);
            }
            const intent = mock.seedPaymentIntent(payment);
            Object.assign(operation, {
                status: "succeeded",
                stripe_object_id: intent.id,
                response: intent,
                attempt_count: 1,
                claimed_at: now,
                completed_at: now,
            });
        }
        if (body.p_operation_type === "refund_create" && mock.nextRefundOperationSucceeded) {
            mock.nextRefundOperationSucceeded = false;
            const amount = Number(operationRequest.amount);
            const refund = {
                id: "re_operation_succeeded",
                charge: operationRequest.chargeId,
                amount,
                currency: operationRequest.currency,
                status: "succeeded",
                metadata: {
                    refund_request_id: operationRequest.refundRequestId,
                    commerce_reason: operationRequest.reason,
                },
                balance_transaction: {
                    id: "txn_refund_operation_succeeded",
                    amount: -amount,
                    fee: 0,
                    net: -amount,
                    currency: operationRequest.currency,
                    fee_details: [],
                },
            };
            mock.providerRefunds.push(refund);
            Object.assign(operation, {
                status: "succeeded",
                stripe_object_id: refund.id,
                response: refund,
                attempt_count: 1,
                claimed_at: now,
                completed_at: now,
            });
        }
        mock.tables.financial_operations.push(operation);
        return jsonResponse(cancellationPayment ? { payment: cancellationPayment, operation } : operation);
    }
    return null;
}
