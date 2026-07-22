import { HttpError } from "../../http/errors.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { callRpcObject, listRows } from "../postgrest.ts";
import type { ConnectPaymentRow } from "../records/payments.ts";
import type { RefundRow } from "../records/refunds.ts";

export type RefundPreflightContext = {
    existingRefund: RefundRow | null;
    hasNonterminal: boolean;
    committedReductionAmount: number;
};

export async function readRefundPreflightContext(
    paymentId: number,
    refundRequestId: string,
): Promise<RefundPreflightContext> {
    const value = await callRpcObject<unknown>("read_refund_preflight_context", {
        p_payment_id: paymentId,
        p_refund_request_id: refundRequestId,
    });
    if (
        !isRecord(value) ||
        (value.existing_refund !== null && !isRecord(value.existing_refund)) ||
        typeof value.has_nonterminal !== "boolean"
    ) {
        throw invalidRefundPreflightContext();
    }
    return {
        existingRefund: value.existing_refund as unknown as RefundRow | null,
        hasNonterminal: value.has_nonterminal,
        committedReductionAmount: amountAt(value, "committed_reduction_amount", false, invalidRefundPreflightContext),
    };
}

export type RefundProjectionContext = {
    refundedAmount: number;
    refundFeeAmount: number;
    payment: ConnectPaymentRow | null;
    sellerRecoveryAmount: number;
};

export async function readRefundProjectionContext(paymentId: number): Promise<RefundProjectionContext> {
    const value = await callRpcObject<unknown>("read_refund_projection_context", {
        p_payment_id: paymentId,
    });
    if (!isRecord(value) || (value.payment !== null && !isRecord(value.payment))) {
        throw invalidRefundProjectionContext();
    }
    return {
        refundedAmount: amountAt(value, "refunded_amount", false),
        refundFeeAmount: amountAt(value, "actual_stripe_refund_fee_amount", true),
        payment: value.payment as unknown as ConnectPaymentRow | null,
        sellerRecoveryAmount: amountAt(value, "seller_recovery_amount", false),
    };
}

export async function sumSucceededAmounts(table: string, paymentId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(`${table}?payment_id=eq.${paymentId}&status=eq.succeeded&select=amount`);
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function sumSucceededTransferReversalAmounts(transferId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(
        `transfer_reversals?transfer_id=eq.${transferId}&status=eq.succeeded&select=amount`,
    );
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function sumConfirmedRecoveryAmount(recoveryId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(
        `transfer_reversals?recovery_id=eq.${recoveryId}&status=eq.succeeded&select=amount`,
    );
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function sumSucceededRefundSellerRecovery(paymentId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(
        `refunds?payment_id=eq.${paymentId}&status=eq.succeeded&select=seller_entitlement_reduction_amount`,
    );
    return rows.reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
}

function amountAt(
    value: JsonRecord,
    key: string,
    signed: boolean,
    invalid: () => HttpError = invalidRefundProjectionContext,
): number {
    const amount = value[key];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || (!signed && amount < 0)) {
        throw invalid();
    }
    return amount;
}

function invalidRefundProjectionContext(): HttpError {
    return new HttpError(502, "refund projection context returned an invalid response");
}

function invalidRefundPreflightContext(): HttpError {
    return new HttpError(502, "refund preflight context returned an invalid response");
}
