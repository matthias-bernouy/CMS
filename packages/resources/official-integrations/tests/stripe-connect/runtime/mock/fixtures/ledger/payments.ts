import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import { ProviderMoneyFixtures } from "../provider/money";

export class PaymentLedgerFixtures extends ProviderMoneyFixtures {
    seedTransientProviderTruthReview(paymentId: number, paymentIntentId: string): void {
        this.patchPaymentLedger(paymentId, {
            payment_status: "failed",
            settlement_status: "manual_review",
            manual_review_reason: "Stripe payment provider truth mismatch: charge_balance_transaction_expansion",
            stripe_charge_id: `ch_${paymentIntentId.slice(3)}`,
            paid_at: null,
        });
        this.insertGeneric("provider_exceptions", {
            deduplication_key: `provider-payment-truth:${paymentId}:${paymentIntentId}`,
            payment_id: paymentId,
            operation_id: null,
            exception_type: "provider_payment_truth_mismatch",
            severity: "critical",
            status: "open",
            message: "Stripe payment provider truth mismatch: charge_balance_transaction_expansion",
            details: { mismatches: ["charge_balance_transaction_expansion"] },
            detected_at: "2026-07-06T12:06:00.000Z",
            resolved_at: null,
            resolved_by: null,
        });
    }

    seedOtherOpenProviderException(paymentId: number): void {
        this.insertGeneric("provider_exceptions", {
            deduplication_key: `other-risk:${paymentId}`,
            payment_id: paymentId,
            operation_id: null,
            exception_type: "other_provider_risk",
            severity: "critical",
            status: "open",
            message: "Independent provider risk",
            details: {},
            detected_at: "2026-07-06T12:07:00.000Z",
            resolved_at: null,
            resolved_by: null,
        });
    }

    seedProviderException(
        deduplicationKey: string,
        status: "open" | "investigating" | "resolved",
        patch: JsonRecord = {},
    ): number {
        return Number(
            this.insertGeneric("provider_exceptions", {
                deduplication_key: deduplicationKey,
                payment_id: null,
                operation_id: null,
                exception_type: "provider_reconciliation_contract",
                severity: "critical",
                status,
                message: "Provider reconciliation contract fixture",
                details: {},
                detected_at: "2026-07-06T12:05:00.000Z",
                resolved_at: status === "resolved" ? "2026-07-06T12:06:00.000Z" : null,
                resolved_by: status === "resolved" ? "admin-contract" : null,
                ...patch,
            }).id,
        );
    }

    seedPaymentReconciliationLedger(paymentId: number): void {
        for (const row of [
            { amount: 120, seller_entitlement_reduction_amount: 70, status: "succeeded" },
            { amount: 80, seller_entitlement_reduction_amount: 50, status: "succeeded" },
            { amount: 400, seller_entitlement_reduction_amount: 400, status: "pending" },
        ]) {
            this.insertGeneric("refunds", {
                payment_id: paymentId,
                stripe_refund_id: null,
                ...row,
            });
        }
        for (const row of [
            { amount: 400, status: "succeeded" },
            { amount: 300, status: "partially_reversed" },
            { amount: 200, status: "reversed" },
            { amount: 600, status: "reserved" },
        ]) {
            this.insertGeneric("transfers", { payment_id: paymentId, ...row });
        }
        for (const row of [
            { amount: 125, status: "succeeded" },
            { amount: 75, status: "succeeded" },
            { amount: 500, status: "failed" },
        ]) {
            this.insertGeneric("transfer_reversals", { payment_id: paymentId, ...row });
        }
    }

    setPaymentReconciliationSellerRecoveryAmount(paymentId: number, amount: number): void {
        const refunds = this.tables.refunds.filter(
            (row) => same(row.payment_id, paymentId) && row.status === "succeeded",
        );
        if (refunds.length === 0) {
            throw new Error(`payment ${paymentId} has no succeeded refund`);
        }
        refunds.forEach((refund, index) => {
            refund.seller_entitlement_reduction_amount = index === 0 ? amount : 0;
        });
    }

    removeTransientProviderTruthException(paymentId: number, paymentIntentId: string): void {
        const exceptionKey = `provider-payment-truth:${paymentId}:${paymentIntentId}`;
        const index = this.tables.provider_exceptions.findIndex((row) => row.deduplication_key === exceptionKey);
        if (index < 0) {
            throw new Error(`unknown provider exception ${exceptionKey}`);
        }
        this.tables.provider_exceptions.splice(index, 1);
    }
    patchPaymentLedger(paymentId: number, patch: JsonRecord): void {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        this.update(payment, patch);
    }

    removePayment(paymentId: number): void {
        const index = this.tables.payments.findIndex((row) => same(row.id, paymentId));
        if (index < 0) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        this.tables.payments.splice(index, 1);
    }

    omitNextPaymentRead(): void {
        this.omitNextPaymentReadResult = true;
    }

    patchRefundLedger(refundId: number, patch: JsonRecord): void {
        const refund = this.tables.refunds.find((row) => same(row.id, refundId));
        if (!refund) {
            throw new Error(`unknown refund ${refundId}`);
        }
        this.update(refund, patch);
    }
}
