import { jsonResponse } from "../../http";
import { isRecord, same } from "../../records";
import type { JsonRecord } from "../../types";
import { PaymentProjectionStatePersistence } from "./projection-state";

export class PaymentProjectionRecoveryPersistence extends PaymentProjectionStatePersistence {
    recoverProjectedPaymentReview(payment: JsonRecord, rawRecovery: unknown): boolean {
        if (!isRecord(rawRecovery)) {
            return false;
        }
        const recovery = rawRecovery;
        const reason = "Stripe payment provider truth mismatch: charge_balance_transaction_expansion";
        const exceptionKey = String(recovery.exceptionKey);
        this.upsertProjectedProviderException(exceptionKey, payment, reason, {
            paymentIntentId: recovery.paymentIntentId,
            chargeId: recovery.chargeId,
            mismatches: ["charge_balance_transaction_expansion"],
        });
        const hasOtherException = this.tables.provider_exceptions.some(
            (row) =>
                same(row.payment_id, payment.id) &&
                ["open", "investigating"].includes(String(row.status)) &&
                row.deduplication_key !== exceptionKey,
        );
        const recovered =
            payment.payment_status === "succeeded" &&
            payment.settlement_status === "manual_review" &&
            payment.manual_review_reason === reason &&
            payment.stripe_payment_intent_id === recovery.paymentIntentId &&
            payment.stripe_charge_id === recovery.chargeId &&
            payment.stripe_charge_balance_transaction_id === recovery.balanceTransactionId &&
            Number(payment.transferred_amount) === 0 &&
            Number(payment.reversed_amount) === 0 &&
            Number(payment.refunded_amount) === 0 &&
            payment.dispute_status === "none" &&
            !hasOtherException;
        if (!recovered) {
            return false;
        }
        this.update(payment, { settlement_status: "held", manual_review_reason: null });
        const exception = this.tables.provider_exceptions.find(
            (row) => row.deduplication_key === exceptionKey && ["open", "investigating"].includes(String(row.status)),
        );
        if (exception) {
            this.update(exception, {
                status: "resolved",
                resolved_at: "2026-07-06T12:10:00.000Z",
                resolved_by: "provider-truth-revalidation",
            });
        }
        this.insertGeneric("payment_events", {
            payment_id: payment.id,
            event_type: "provider_payment_truth_revalidated",
            actor_kind: recovery.actorKind,
            actor_id: recovery.actorId,
            previous_payment_status: "succeeded",
            next_payment_status: "succeeded",
            previous_settlement_status: "manual_review",
            next_settlement_status: "held",
            data: {
                resolvedReason: reason,
                paymentIntentId: recovery.paymentIntentId,
                chargeId: recovery.chargeId,
                balanceTransactionId: recovery.balanceTransactionId,
            },
        });
        return true;
    }

    upsertProjectedProviderException(key: string, payment: JsonRecord, message: string, details: JsonRecord): void {
        const values = {
            deduplication_key: key,
            payment_id: payment.id,
            operation_id: null,
            exception_type: "provider_payment_truth_mismatch",
            severity: "critical",
            status: "open",
            message,
            details,
            resolved_at: null,
            resolved_by: null,
        };
        const existing = this.tables.provider_exceptions.find((row) => row.deduplication_key === key);
        if (existing) {
            this.update(existing, values);
        } else {
            this.insertGeneric("provider_exceptions", values);
        }
    }

    enqueuePaymentProviderProjection(payment: JsonRecord, projectionKey: string): void {
        if (this.tables.commerce_projection_outbox.some((row) => row.projection_key === projectionKey)) {
            return;
        }
        this.insertGeneric("commerce_projection_outbox", {
            operation_id: null,
            payment_id: payment.id,
            projection_key: projectionKey,
            projection_kind: "payment",
            provider_object_id: String(payment.id),
            projection_payload: {},
            recovery_key: null,
            causal_sequence: 0,
            projection_status: "pending",
            attempt_count: 0,
            next_attempt_at: null,
            claim_owner: null,
            claim_token: null,
            claimed_at: null,
            last_error: null,
            projected_at: null,
            intervention_revision: 0,
            last_intervention_at: null,
            last_intervention_by: null,
            last_intervention_reason: null,
        });
    }

    paymentProjectionSnapshot(): {
        payments: JsonRecord[];
        outbox: JsonRecord[];
        exceptions: JsonRecord[];
        events: JsonRecord[];
        nextRowId: number;
    } {
        return structuredClone({
            payments: this.tables.payments,
            outbox: this.tables.commerce_projection_outbox,
            exceptions: this.tables.provider_exceptions,
            events: this.tables.payment_events,
            nextRowId: this.nextRowId,
        });
    }

    paymentProjectionEnqueueFailure(
        snapshot: ReturnType<PaymentProjectionRecoveryPersistence["paymentProjectionSnapshot"]>,
    ): Response | null {
        if (!this.failPaymentProjectionEnqueue) {
            return null;
        }
        this.failPaymentProjectionEnqueue = false;
        this.tables.payments = snapshot.payments;
        this.tables.commerce_projection_outbox = snapshot.outbox;
        this.tables.provider_exceptions = snapshot.exceptions;
        this.tables.payment_events = snapshot.events;
        this.nextRowId = snapshot.nextRowId;
        return jsonResponse({ message: "simulated payment projection enqueue failure" }, 500);
    }
}
