import { same } from "../../records";
import type { JsonRecord } from "../../types";
import { defaultAccountRow } from "../accounts";
import { QueryPersistence } from "./queries";

export class PaymentPersistence extends QueryPersistence {
    upsertAccount(value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:00:00.000Z";
        const index = this.tables.accounts.findIndex((row) => same(row.cms_user_id, value.cms_user_id));
        const next = {
            ...(index >= 0 ? this.tables.accounts[index] : defaultAccountRow(String(value.cms_user_id), now)),
            ...value,
            updated_at: now,
        };
        if (index >= 0) {
            this.tables.accounts[index] = next;
        } else {
            this.tables.accounts.push(next);
        }
        return { ...next };
    }

    insertPayment(value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:05:00.000Z";
        const row = {
            id: this.nextPaymentId++,
            stripe_payment_intent_id: null,
            stripe_charge_id: null,
            stripe_charge_balance_transaction_id: null,
            last_stripe_event_id: null,
            refunded_amount: 0,
            transferred_amount: 0,
            reversed_amount: 0,
            actual_stripe_charge_fee_amount: 0,
            actual_stripe_refund_fee_amount: 0,
            actual_stripe_processing_fee_amount: 0,
            actual_stripe_charge_net_amount: null,
            actual_stripe_fee_currency: null,
            actual_stripe_charge_fee_details: [],
            dispute_status: "none",
            manual_review_reason: null,
            paid_at: null,
            cancelled_at: null,
            last_provider_sync_at: null,
            created_at: now,
            updated_at: now,
            ...value,
        };
        this.tables.payments.push(row);
        return { ...row };
    }

    seedPaymentIntent(payment: JsonRecord): JsonRecord {
        const id = `pi_${this.nextIntentId++}`;
        const intent = {
            id,
            client_secret: `${id}_secret`,
            status: "requires_payment_method",
            amount: payment.amount_total,
            amount_received: 0,
            currency: payment.currency,
            transfer_group: payment.transfer_group,
            metadata: {
                cms_payment_id: String(payment.id),
                client_reference_id: payment.client_reference_id,
                financial_terms_hash: payment.financial_terms_hash,
                seller_cms_user_id: payment.seller_cms_user_id,
            },
            latest_charge: null,
        };
        this.paymentIntents.set(id, intent);
        return intent;
    }
}
