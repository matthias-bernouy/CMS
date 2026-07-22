import { asRecord, isRecord } from "../../../records";
import type { JsonRecord } from "../../../types";
import { StripeMockState } from "../../state";

export class ProviderPaymentFixtures extends StripeMockState {
    setPaymentIntentSucceeded(paymentIntentId: string): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`unknown PaymentIntent ${paymentIntentId}`);
        }
        const chargeId = `ch_${paymentIntentId.slice(3)}`;
        const balanceTransaction: JsonRecord = {
            id: `txn_charge_${paymentIntentId.slice(3)}`,
            amount: intent.amount,
            fee: 65,
            net: Number(intent.amount) - 65,
            currency: intent.currency,
            fee_details: [{ type: "stripe_fee", amount: 65, currency: intent.currency }],
        };
        const charge: JsonRecord = {
            id: chargeId,
            payment_intent: paymentIntentId,
            amount: intent.amount,
            amount_captured: intent.amount,
            amount_refunded: 0,
            currency: intent.currency,
            transfer_group: intent.transfer_group,
            paid: true,
            captured: true,
            balance_transaction: balanceTransaction,
        };
        this.providerCharges.set(chargeId, charge);
        this.providerBalanceTransactions.set(String(balanceTransaction.id), balanceTransaction);
        Object.assign(intent, {
            status: "succeeded",
            amount_received: intent.amount,
            latest_charge: charge,
        });
    }

    setPaymentIntentProviderReferences(paymentIntentId: string): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent || !isRecord(intent.latest_charge)) {
            throw new Error(`unknown PaymentIntent charge ${paymentIntentId}`);
        }
        const charge = intent.latest_charge;
        if (!isRecord(charge.balance_transaction)) {
            throw new Error(`unknown Charge balance transaction ${paymentIntentId}`);
        }
        charge.balance_transaction = String(charge.balance_transaction.id);
        intent.latest_charge = String(charge.id);
    }

    patchProviderBalanceTransaction(paymentIntentId: string, patch: JsonRecord): void {
        const transaction = this.providerBalanceTransactions.get(`txn_charge_${paymentIntentId.slice(3)}`);
        if (!transaction) {
            throw new Error(`unknown BalanceTransaction ${paymentIntentId}`);
        }
        Object.assign(transaction, patch);
    }
    patchPaymentIntent(paymentIntentId: string, patch: JsonRecord): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`unknown PaymentIntent ${paymentIntentId}`);
        }
        Object.assign(intent, patch);
    }

    patchPaymentIntentMetadata(paymentIntentId: string, patch: JsonRecord): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent) {
            throw new Error(`unknown PaymentIntent ${paymentIntentId}`);
        }
        intent.metadata = { ...asRecord(intent.metadata), ...patch };
    }

    patchLatestCharge(paymentIntentId: string, patch: JsonRecord): void {
        const intent = this.paymentIntents.get(paymentIntentId);
        if (!intent || !isRecord(intent.latest_charge)) {
            throw new Error(`unknown PaymentIntent charge ${paymentIntentId}`);
        }
        Object.assign(intent.latest_charge, patch);
    }

    losePaymentCancellationResponseOnce(): void {
        this.loseNextPaymentCancellationResponse = true;
    }

    keepNextPaymentCancellationNonTerminal(): void {
        this.returnNextPaymentCancellationNonTerminal = true;
    }

    failNextPaymentCancellationOperationReservation(): void {
        this.failNextPaymentCancellationReservation = true;
    }
}
