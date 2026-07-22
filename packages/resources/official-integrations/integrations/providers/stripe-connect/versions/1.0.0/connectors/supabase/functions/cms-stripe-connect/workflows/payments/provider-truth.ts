import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import type { StripePaymentIntent } from "../../provider/types.ts";
import { isRecord, numberAt, objectAt, stringAt, stripeObjectId } from "../../shared/data.ts";

export function providerPaymentTruthMismatches(
    payment: ConnectPaymentRow,
    intent: StripePaymentIntent,
    expectedPaymentIntentId: string | undefined,
): string[] {
    const mismatches: string[] = [];
    if (!expectedPaymentIntentId || intent.id !== expectedPaymentIntentId) {
        mismatches.push("payment_intent_id");
    }
    if (numberAt(intent, "amount") !== payment.amount_total) {
        mismatches.push("payment_intent_amount");
    }
    if (numberAt(intent, "amount_received") !== payment.amount_total) {
        mismatches.push("payment_intent_amount_received");
    }
    if (stringAt(intent, "currency").toLowerCase() !== payment.currency) {
        mismatches.push("payment_intent_currency");
    }
    if (stringAt(intent, "transfer_group") !== payment.transfer_group) {
        mismatches.push("payment_intent_transfer_group");
    }
    const metadata = objectAt(intent, "metadata");
    if (stringAt(metadata, "cms_payment_id") !== String(payment.id)) {
        mismatches.push("metadata_cms_payment_id");
    }
    if (stringAt(metadata, "client_reference_id") !== payment.client_reference_id) {
        mismatches.push("metadata_client_reference_id");
    }
    if (stringAt(metadata, "financial_terms_hash") !== payment.financial_terms_hash) {
        mismatches.push("metadata_financial_terms_hash");
    }
    if (stringAt(metadata, "seller_cms_user_id") !== payment.seller_cms_user_id) {
        mismatches.push("metadata_seller_cms_user_id");
    }

    const charge = isRecord(intent.latest_charge) ? intent.latest_charge : null;
    if (!charge) {
        mismatches.push("latest_charge_expansion");
        return mismatches;
    }
    const providerChargeId = stringAt(charge, "id");
    if (!providerChargeId || (payment.stripe_charge_id && providerChargeId !== payment.stripe_charge_id)) {
        mismatches.push("charge_id");
    }
    if (stripeObjectId(charge.payment_intent) !== intent.id) {
        mismatches.push("charge_payment_intent");
    }
    if (numberAt(charge, "amount") !== payment.amount_total) {
        mismatches.push("charge_amount");
    }
    if (numberAt(charge, "amount_captured") !== payment.amount_total) {
        mismatches.push("charge_amount_captured");
    }
    if (stringAt(charge, "currency").toLowerCase() !== payment.currency) {
        mismatches.push("charge_currency");
    }
    if (stringAt(charge, "transfer_group") !== payment.transfer_group) {
        mismatches.push("charge_transfer_group");
    }
    if (charge.paid !== true) {
        mismatches.push("charge_paid");
    }
    if (charge.captured !== true) {
        mismatches.push("charge_captured");
    }
    const balanceTransaction = isRecord(charge.balance_transaction) ? charge.balance_transaction : null;
    if (!balanceTransaction) {
        mismatches.push("charge_balance_transaction_expansion");
    } else {
        const balanceTransactionId = stringAt(balanceTransaction, "id");
        const balanceAmount = numberAt(balanceTransaction, "amount");
        const balanceFee = numberAt(balanceTransaction, "fee");
        const balanceNet = numberAt(balanceTransaction, "net");
        const balanceCurrency = stringAt(balanceTransaction, "currency").toLowerCase();
        if (!balanceTransactionId.startsWith("txn_")) {
            mismatches.push("charge_balance_transaction_id");
        }
        if (balanceAmount !== payment.amount_total) {
            mismatches.push("charge_balance_transaction_amount");
        }
        if (!Number.isSafeInteger(balanceFee) || balanceFee! < 0) {
            mismatches.push("charge_balance_transaction_fee");
        }
        if (!Number.isSafeInteger(balanceNet) || balanceNet !== balanceAmount! - balanceFee!) {
            mismatches.push("charge_balance_transaction_net");
        }
        if (balanceCurrency !== payment.currency) {
            mismatches.push("charge_balance_transaction_currency");
        }
        if (!Array.isArray(balanceTransaction.fee_details)) {
            mismatches.push("charge_balance_transaction_fee_details");
        }
        if (
            payment.stripe_charge_balance_transaction_id &&
            balanceTransactionId !== payment.stripe_charge_balance_transaction_id
        ) {
            mismatches.push("charge_balance_transaction_replay_id");
        }
    }
    const refunded = numberAt(charge, "amount_refunded");
    if (!Number.isSafeInteger(refunded) || refunded! < 0 || refunded! > payment.amount_total) {
        mismatches.push("charge_amount_refunded");
    }
    return mismatches;
}
