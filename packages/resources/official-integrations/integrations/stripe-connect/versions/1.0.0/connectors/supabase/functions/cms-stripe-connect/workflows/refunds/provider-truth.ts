import type { RefundRow } from "../../db/records/refunds.ts";
import { HttpError } from "../../http/errors.ts";
import { retrieveStripeBalanceTransaction } from "../../provider/payments.ts";
import { listStripeRefundsByCharge } from "../../provider/refunds.ts";
import type { StripeRefund } from "../../provider/types.ts";
import { isRecord, numberAt, objectAt, recordArrayAt, stringAt, stripeObjectId } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function findStripeRefund(
    chargeId: string,
    refundRequestId: string,
    amount: number,
): Promise<StripeRefund | null> {
    const list = await listStripeRefundsByCharge(chargeId, true);
    const matches = recordArrayAt(list, "data").filter(
        (refund) =>
            Number(refund.amount) === amount &&
            stripeObjectId(refund.charge) === chargeId &&
            stringAt(objectAt(refund, "metadata"), "refund_request_id") === refundRequestId,
    );
    if (matches.length > 1 || (matches.length === 0 && list.has_more === true)) {
        throw new HttpError(409, "Stripe Refund search is ambiguous");
    }
    return (matches[0] as StripeRefund | undefined) ?? null;
}

export async function resolveRefundBalanceTransaction(provider: StripeRefund, refund: RefundRow): Promise<JsonRecord> {
    const raw = provider.balance_transaction;
    const transaction = isRecord(raw)
        ? raw
        : typeof raw === "string" && raw.startsWith("txn_")
          ? await retrieveStripeBalanceTransaction(raw)
          : null;
    if (!transaction) {
        throw new HttpError(409, "succeeded Stripe Refund omitted its balance transaction");
    }
    const id = stringAt(transaction, "id");
    const amount = numberAt(transaction, "amount");
    const fee = numberAt(transaction, "fee");
    const net = numberAt(transaction, "net");
    const currency = stringAt(transaction, "currency").toLowerCase();
    if (
        !id.startsWith("txn_") ||
        amount !== -refund.amount ||
        !Number.isSafeInteger(fee) ||
        !Number.isSafeInteger(net) ||
        net !== amount! - fee! ||
        currency !== refund.currency ||
        !Array.isArray(transaction.fee_details)
    ) {
        throw new HttpError(409, "Stripe Refund balance transaction does not match immutable refund truth");
    }
    if (refund.stripe_balance_transaction_id && refund.stripe_balance_transaction_id !== id) {
        throw new HttpError(409, "Stripe Refund balance transaction replay changed identity");
    }
    return transaction;
}

export function refundStatusFromStripe(refund: StripeRefund): string {
    switch (refund.status) {
        case "succeeded":
            return "succeeded";
        case "failed":
        case "canceled":
            return refund.status === "canceled" ? "cancelled" : "failed";
        case "pending":
        case "requires_action":
            return "pending";
        default:
            return "processing";
    }
}
