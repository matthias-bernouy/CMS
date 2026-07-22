import { financialTermsHash } from "../../constants";
import { ReconciliationRuntimeFixtures } from "./reconciliation/runtime";

export class DisputeFixtures extends ReconciliationRuntimeFixtures {
    seedDispute(disputeId: string, status: string, evidenceStatus: string, submitted: boolean): void {
        const now = "2026-07-06T12:00:00.000Z";
        if (!this.tables.payments.some((row) => row.id === 999)) {
            this.tables.payments.push({
                id: 999,
                client_reference_id: "order-dispute-seed",
                financial_terms_hash: financialTermsHash,
                financial_revision: 1,
                dual_approval_threshold_amount: 1000,
                buyer_cms_user_id: "buyer-seed",
                seller_cms_user_id: "seller-seed",
                seller_stripe_account_id: "acct_seller_seed",
                stripe_payment_intent_id: "pi_dispute_seed",
                stripe_charge_id: "ch_disputed",
                stripe_charge_balance_transaction_id: "txn_charge_dispute_seed",
                last_stripe_event_id: null,
                transfer_group: "cms_order_dispute_seed",
                currency: "eur",
                amount_total: 1200,
                seller_transfer_amount: 1080,
                platform_retained_amount: 120,
                refunded_amount: 0,
                transferred_amount: 0,
                reversed_amount: 0,
                actual_stripe_charge_fee_amount: 65,
                actual_stripe_refund_fee_amount: 0,
                actual_stripe_processing_fee_amount: 65,
                actual_stripe_charge_net_amount: 1135,
                actual_stripe_fee_currency: "eur",
                actual_stripe_charge_fee_details: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
                payment_status: "succeeded",
                settlement_status: "blocked",
                dispute_status: "open",
                description: null,
                manual_review_reason: null,
                paid_at: now,
                cancelled_at: null,
                last_provider_sync_at: now,
                created_at: now,
                updated_at: now,
            });
        }
        const disputeRowId = this.nextRowId++;
        this.tables.stripe_disputes.push({
            id: disputeRowId,
            payment_id: 999,
            stripe_dispute_id: disputeId,
            stripe_charge_id: "ch_disputed",
            amount: 1200,
            currency: "eur",
            reason: "fraudulent",
            status,
            evidence_status: evidenceStatus,
            evidence_due_by: "2099-07-06T12:00:00.000Z",
            is_charge_refundable: false,
            balance_transaction_ids: [],
            provider_snapshot: { id: disputeId, status },
            created_at: now,
            updated_at: now,
        });
        this.tables.stripe_dispute_evidence.push({
            id: this.nextRowId++,
            dispute_id: disputeRowId,
            evidence_operation_id: `evidence-${disputeId}`,
            evidence: { uncategorized_text: "Evidence" },
            staged_by: "finance-user",
            staged_at: now,
            submitted_operation_id: submitted ? 88 : null,
            submitted_at: submitted ? now : null,
        });
    }

    seedAbandonedStripeEvent(): void {
        this.tables.stripe_events.push({
            id: this.nextRowId++,
            stripe_account_id: "platform",
            event_id: "evt_abandoned",
            event_type: "test_helpers.test_clock.ready",
            object_id: "clock_abandoned",
            api_version: "2026-02-25.clover",
            livemode: false,
            provider_created_at: "2026-07-06T10:00:00.000Z",
            payload_sha256: "a".repeat(64),
            payload: {
                id: "evt_abandoned",
                type: "test_helpers.test_clock.ready",
                data: { object: { id: "clock_abandoned" } },
            },
            processing_status: "processing",
            attempt_count: 1,
            processing_started_at: "2026-07-06T10:00:00.000Z",
            last_error: null,
            received_at: "2026-07-06T10:00:00.000Z",
            processed_at: null,
        });
    }

    seedPendingStripeEvents(count: number): void {
        for (let index = 0; index < count; index++) {
            const eventId = `evt_pending_backlog_${index + 1}`;
            this.tables.stripe_events.push({
                id: this.nextRowId++,
                stripe_account_id: "platform",
                event_id: eventId,
                event_type: "test_helpers.test_clock.ready",
                object_id: `clock_pending_${index + 1}`,
                api_version: "2026-02-25.clover",
                livemode: false,
                provider_created_at: "2026-07-06T10:00:00.000Z",
                payload_sha256: "b".repeat(64),
                payload: {
                    id: eventId,
                    type: "test_helpers.test_clock.ready",
                    data: { object: { id: `clock_pending_${index + 1}` } },
                },
                processing_status: "pending",
                attempt_count: 0,
                processing_started_at: null,
                last_error: null,
                received_at: "2026-07-06T10:00:00.000Z",
                processed_at: null,
            });
        }
    }

    seedFailedSellerRiskHoldOperation(userId: string, appliedMinimum: number): number {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account?.stripe_account_id) {
            throw new Error(`unknown connected account ${userId}`);
        }
        this.setConnectedPayoutSettings("manual", appliedMinimum);
        const operation = this.insertGeneric("financial_operations", {
            payment_id: null,
            business_key: `seller-risk-hold:${userId}:lost-database-response`,
            operation_type: "payout_schedule_update",
            status: "failed",
            stripe_object_id: null,
            request: {
                cmsUserId: userId,
                stripeAccountId: account.stripe_account_id,
                restoreSettings: {
                    interval: "daily",
                    minimumBalanceEur: 0,
                    debitNegativeBalances: false,
                },
                interval: "manual",
                minimumBalanceEur: appliedMinimum,
                debitNegativeBalances: true,
                reason: "Seller recovery exposure hold",
            },
            response: null,
            last_error: "connection closed after Stripe committed the update",
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
        });
        return Number(operation.id);
    }
}
