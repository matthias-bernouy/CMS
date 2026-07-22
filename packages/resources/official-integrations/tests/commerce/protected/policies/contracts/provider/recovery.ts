import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerPaymentRecoveryTest(): void {
    test("recovers only the exact revalidated provider-payment ambiguity and otherwise stays fail-closed", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const projection = functionSql(
            schema,
            "record_order_payment_projection",
            "record_order_fulfillment_projection",
        );
        const manualQualification = projection.slice(
            projection.indexOf("v_provider_review_recoverable :="),
            projection.indexOf("v_event_id :="),
        );
        const successBranch = projection.slice(
            projection.indexOf("elsif p_status = 'succeeded' then"),
            projection.indexOf("elsif p_status = 'manual_review' then"),
        );
        const manualReviewBranch = projection.slice(projection.indexOf("elsif p_status = 'manual_review' then"));

        expect(successBranch).toContain("from commerce.order_settlements");
        expect(successBranch).toContain("from commerce.order_fulfillments");
        expect(successBranch).toContain("for update");
        expect(successBranch).toContain("v_settlement.status = 'manual_review'");
        expect(successBranch).toContain("v_settlement.manual_review_reason in (");
        expect(successBranch).toContain("'provider_payment_manual_review_nonrecoverable'");
        expect(projection).toContain("'Stripe payment provider truth mismatch: charge_balance_transaction_expansion'");
        expect(manualQualification).toContain("p_status = 'manual_review'");
        expect(manualQualification).toContain("v_provider_review_reason = v_transient_provider_review_reason");
        expect(manualQualification).toContain("p_provider_snapshot->>'paymentStatus' in ('failed', 'succeeded')");
        expect(manualQualification).toContain("'commercePaymentStatus', 'manual_review'");
        expect(manualQualification).toContain("'settlementStatus', 'manual_review'");
        expect(manualQualification).toContain("'sellerTransferAmount', v_terms.seller_proceeds_amount");
        expect(manualQualification).toContain("'platformRetainedAmount', v_terms.platform_retained_amount");
        expect(manualQualification).toContain("p_provider_snapshot->>'clientReferenceId' = v_order.public_id::text");
        expect(manualQualification).toContain("'amountTotal', v_terms.buyer_total_amount");
        expect(manualQualification).toContain("lower(p_provider_snapshot->>'currency') = v_terms.currency");
        expect(manualQualification).toContain(
            "p_provider_snapshot->>'financialTermsHash' = v_terms.financial_terms_hash",
        );
        expect(manualQualification).toContain("p_provider_payment_intent_id is not null");
        expect(manualQualification).toContain("p_provider_charge_id is not null");
        expect(manualQualification).toContain(
            "p_provider_snapshot->>'stripePaymentIntentId' = p_provider_payment_intent_id",
        );
        expect(manualQualification).toContain("p_provider_snapshot->>'stripeChargeId' = p_provider_charge_id");
        expect(manualQualification).toContain("p_provider_snapshot->>'stripeChargeBalanceTransactionId'");
        expect(manualQualification).toContain("p_occurred_at = v_snapshot_updated_at");
        expect(projection).toContain("p_provider_snapshot->>'updatedAt'");
        expect(projection).toContain("v_snapshot_updated_at :=");
        expect(manualQualification).toContain("v_settlement.status = 'held'");
        expect(manualQualification).toContain("v_settlement.manual_review_reason is null");
        expect(manualQualification).toContain("v_fulfillment.status in (");
        expect(manualQualification).toContain("v_fulfillment.blocking_reason is null");
        expect(manualQualification).toContain("v_fulfillment.claim_window_started_at is null");
        expect(manualQualification).not.toContain("'collected_by_recipient'");
        expect(projection).toContain("p_status not in ('succeeded', 'manual_review')");
        expect(successBranch).toContain("'paymentStatus', 'succeeded'");
        expect(successBranch).toContain("'commercePaymentStatus', 'succeeded'");
        expect(successBranch).toContain("'settlementStatus', 'held'");
        expect(successBranch).toContain("'disputeStatus', 'none'");
        expect(successBranch).toContain("'sellerTransferAmount', v_terms.seller_proceeds_amount");
        expect(successBranch).toContain("'platformRetainedAmount', v_terms.platform_retained_amount");
        expect(successBranch).toContain("'refundedAmount', 0");
        expect(successBranch).toContain("'transferredAmount', 0");
        expect(successBranch).toContain("'reversedAmount', 0");
        expect(successBranch).toContain("p_provider_snapshot->>'clientReferenceId' = v_order.public_id::text");
        expect(successBranch).toContain("'amountTotal', v_terms.buyer_total_amount");
        expect(successBranch).toContain("lower(p_provider_snapshot->>'currency') = v_terms.currency");
        expect(successBranch).toContain("p_provider_snapshot->>'financialTermsHash' = v_terms.financial_terms_hash");
        expect(successBranch).toContain("p_occurred_at = v_snapshot_updated_at");
        expect(successBranch).toContain("p_provider_snapshot->'manualReviewReason' = 'null'::jsonb");
        expect(successBranch).toContain("p_provider_payment_intent_id is not null");
        expect(successBranch).toContain("p_provider_charge_id is not null");
        expect(successBranch).toContain("p_provider_snapshot->>'stripePaymentIntentId' = p_provider_payment_intent_id");
        expect(successBranch).toContain("p_provider_snapshot->>'stripeChargeId' = p_provider_charge_id");
        expect(successBranch).toContain("p_provider_snapshot->>'stripeChargeBalanceTransactionId'");
        expect(successBranch).toContain("like 'txn_%'");
        expect(successBranch).not.toContain("p_provider_payment_intent_id is null\n                or");
        expect(successBranch).not.toContain("p_provider_charge_id is null\n                or");
        expect(successBranch).toContain("financial_exception.reason = 'Ambiguous provider payment state'");
        expect(successBranch).toContain("'Provider payment requires non-automatic manual review'");
        expect(successBranch).toContain("financial_exception.details->>'recoverable' = 'false'");
        expect(successBranch).toContain(
            "financial_exception.details->>'providerPaymentId' = p_provider_payment_id::text",
        );
        expect(successBranch).toContain("financial_exception.details->>'providerManualReviewReason'");
        expect(successBranch).toContain("financial_exception.details->>'recoverable' = 'true'");
        expect(successBranch).toContain("financial_exception.details->>'providerOccurredAt'");
        expect(successBranch).toContain("v_review_occurred_at :=");
        expect(successBranch).toContain("p_occurred_at > v_review_occurred_at");
        expect(successBranch).toContain("financial_exception.status in ('open', 'investigating')");
        expect(successBranch).toContain(
            "and not exists (\n                select 1\n                from commerce.financial_exceptions",
        );
        expect(successBranch).toContain("from commerce.provider_projection_events provider_event");
        expect(successBranch).toContain("provider_event.event_type like 'payment.%'");
        expect(successBranch).toContain("provider_event.provider_event_id <> p_provider_event_id");
        expect(successBranch).toContain("provider_event.occurred_at >= p_occurred_at");
        for (const blocker of [
            "commerce.marketplace_claims",
            "commerce.stripe_dispute_projections",
            "commerce.refund_requests",
            "commerce.order_cancellation_requests",
            "commerce.payment_cancellation_requests",
            "commerce.settlement_release_authorizations",
            "commerce.financial_operation_dispatch_claims",
            "commerce.seller_financial_exposures",
        ]) {
            expect(successBranch).toContain(blocker);
        }
        expect(successBranch).toContain("v_settlement.total_transferred_amount = 0");
        expect(successBranch).toContain("v_settlement.total_reversed_amount = 0");
        expect(successBranch).toContain("v_settlement.total_refunded_amount = 0");
        expect(successBranch).toContain("v_settlement.provider_transfer_id is null");
        expect(successBranch).toContain("status = 'held', manual_review_reason = null");
        expect(successBranch).toContain("resolved_by = 'stripe-provider-truth-revalidation'");
        expect(successBranch).toContain("'ambiguous_payment_state_revalidated'");
        expect(successBranch).toContain("'commerce.order.payment_review_recovered'");
        expect(successBranch).toContain("v_recovered_ambiguous_payment := true");
        expect(successBranch).toContain("if (v_settlement.status = 'held' or v_recovered_ambiguous_payment)");
        expect(successBranch).toContain("and (v_payment_review_transition_safe or v_recovered_ambiguous_payment)");
        expect(successBranch).toContain("and v_settlement.manual_review_reason is null");
        expect(successBranch).toContain("and v_fulfillment.blocking_reason is null");
        expect(successBranch).toContain("and v_fulfillment.release_eligible_at is null");
        expect(projection).toContain("'paymentReviewRecovered', v_recovered_ambiguous_payment");
        expect(manualReviewBranch).toContain(
            "'ambiguous-payment-state:' || v_order.id || ':' || p_provider_payment_id",
        );
        expect(manualReviewBranch).toContain(
            "'provider-payment-review:' || v_order.id || ':' || p_provider_payment_id",
        );
        expect(manualReviewBranch).toContain("'provider_payment_manual_review_nonrecoverable'");
        expect(manualReviewBranch).toContain("if v_payment_review_transition_safe then");
        expect(manualReviewBranch).toContain("and status = 'held'");
        expect(manualReviewBranch).toContain("and manual_review_reason is null");
        expect(manualReviewBranch).toContain("'providerManualReviewReason', v_provider_review_reason");
        expect(manualReviewBranch).toContain("'providerEventId', p_provider_event_id");
        expect(manualReviewBranch).toContain("'providerOccurredAt', p_occurred_at");
        expect(manualReviewBranch).toContain("'recoverable', v_provider_review_recoverable");
        expect(manualReviewBranch).toContain("insert into commerce.financial_exceptions as financial_exception");
        expect(manualReviewBranch).toContain("on conflict (deduplication_key)");
        expect(manualReviewBranch).toContain("status = 'open'");
        expect(manualReviewBranch).toContain("resolved_at = null, resolved_by = null");
        expect(manualReviewBranch).toContain("financial_exception.details->>'providerOccurredAt'");
        expect(manualReviewBranch).toContain("excluded.details->>'providerOccurredAt'");
        expect(manualReviewBranch).toContain("else 'infinity'::timestamptz");
        expect(manualReviewBranch).toContain("else '-infinity'::timestamptz");
    });
}
