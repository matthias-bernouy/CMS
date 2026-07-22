import { HttpError } from "../../http/errors.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { callRpcObject, listRows } from "../postgrest.ts";
import type { ConnectPaymentRow } from "../records/payments.ts";

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

function amountAt(value: JsonRecord, key: string, signed: boolean): number {
    const amount = value[key];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || (!signed && amount < 0)) {
        throw invalidRefundProjectionContext();
    }
    return amount;
}

function invalidRefundProjectionContext(): HttpError {
    return new HttpError(502, "refund projection context returned an invalid response");
}
