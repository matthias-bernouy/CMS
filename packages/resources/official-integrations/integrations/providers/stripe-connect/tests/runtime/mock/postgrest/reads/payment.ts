import { jsonResponse } from "../../../http";
import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handlePaymentReadRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/read_payment_reconciliation_ledger" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        const succeededRefunds = mock.tables.refunds.filter(
            (row) => same(row.payment_id, paymentId) && row.status === "succeeded",
        );
        return jsonResponse([
            {
                refunded_amount: succeededRefunds.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
                transferred_amount: mock.tables.transfers
                    .filter(
                        (row) =>
                            same(row.payment_id, paymentId) &&
                            ["succeeded", "partially_reversed", "reversed"].includes(String(row.status)),
                    )
                    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
                reversed_amount: mock.tables.transfer_reversals
                    .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
                seller_recovery_amount: succeededRefunds.reduce(
                    (sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0),
                    0,
                ),
            },
        ]);
    }
    if (table === "rpc/read_refund_preflight_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        const refundRequestId = String(body.p_refund_request_id);
        await mock.waitForPostgrestRead("refunds");
        const existing = mock.tables.refunds.find((row) => row.refund_request_id === refundRequestId);
        if (existing) {
            return jsonResponse([
                {
                    existing_refund: { ...existing },
                    has_nonterminal: false,
                    committed_reduction_amount: 0,
                },
            ]);
        }
        await mock.waitForPostgrestRead("refunds");
        const refunds = mock.tables.refunds.filter((row) => same(row.payment_id, paymentId));
        return jsonResponse([
            {
                existing_refund: null,
                has_nonterminal: refunds.some((row) =>
                    ["reserved", "processing", "pending", "manual_review"].includes(String(row.status)),
                ),
                committed_reduction_amount: refunds
                    .filter((row) => row.status === "succeeded")
                    .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0),
            },
        ]);
    }
    if (table === "rpc/read_refund_projection_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        await mock.waitForPostgrestRead("refunds");
        const succeededAtAmount = mock.tables.refunds.filter(
            (row) => same(row.payment_id, paymentId) && row.status === "succeeded",
        );
        const refundedAmount = succeededAtAmount.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        await mock.waitForPostgrestRead("refunds");
        const refundFeeAmount = mock.tables.refunds
            .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
            .reduce((sum, row) => sum + Number(row.actual_stripe_fee_amount ?? 0), 0);
        await mock.waitForPostgrestRead("payments");
        const paymentRow = mock.tables.payments.find((row) => same(row.id, paymentId));
        const payment = paymentRow ? { ...paymentRow } : null;
        let sellerRecoveryAmount = 0;
        if (payment) {
            await mock.waitForPostgrestRead("refunds");
            sellerRecoveryAmount = mock.tables.refunds
                .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
                .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
        }
        return jsonResponse([
            {
                refunded_amount: refundedAmount,
                actual_stripe_refund_fee_amount: refundFeeAmount,
                payment,
                seller_recovery_amount: sellerRecoveryAmount,
            },
        ]);
    }
    if (table === "rpc/read_transfer_reversal_completion_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        await mock.waitForPostgrestRead("transfer_reversals");
        const reversedAmount = mock.tables.transfer_reversals
            .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
            .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        await mock.waitForPostgrestRead("payments");
        let payment = mock.tables.payments.find((row) => same(row.id, paymentId));
        if (mock.omitNextPaymentReadResult) {
            mock.omitNextPaymentReadResult = false;
            payment = undefined;
        }
        return jsonResponse([
            {
                reversed_amount: reversedAmount,
                payment: payment ? { ...payment } : null,
            },
        ]);
    }
    return null;
}
