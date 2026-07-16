import { describe, expect, test } from "bun:test";
import {
    clearProviderRequests,
    newerAt,
    olderAt,
    postgrestQuery,
    postgrestTables,
    refreshedAt,
    responseBody,
    type CreateDashboardReadHarness,
    type JsonRecord,
} from "./dashboard-contract-harness";

export function registerRefundAndDisputeDashboardContracts(
    createHarness: CreateDashboardReadHarness,
): void {
    describe("stripe-connect refund dashboard read contracts", () => {
        test("keeps exact list/detail payloads and the current 1+N PostgREST budget", async () => {
            const harness = await createHarness();
            const firstPaymentId = harness.rest.seedDashboardPayment("order-refund-new");
            const secondPaymentId = harness.rest.seedDashboardPayment("order-refund-old");
            const first = harness.rest.seedDashboardRow("refunds", refundRow(
                firstPaymentId, "refund-new", newerAt, { commerce_refund_request_id: null },
            ));
            const second = harness.rest.seedDashboardRow("refunds", refundRow(
                secondPaymentId, "refund-old", olderAt, { stripe_refund_id: null, status: "pending" },
            ));
            const thirdPaymentId = harness.rest.seedDashboardPayment("order-refund-outside-page");
            harness.rest.seedDashboardRow("refunds", refundRow(
                thirdPaymentId, "refund-outside-page", olderAt, {},
            ));

            clearProviderRequests(harness);
            const listedResponse = await harness.request("admin-1", "admin", "listProviderRefunds", { limit: "2" });
            expect(listedResponse.status).toBe(200);
            expect(await responseBody(listedResponse)).toEqual({
                refunds: [
                    publicRefund(first, "order-refund-new"),
                    publicRefund(second, "order-refund-old"),
                ],
                total: 2,
            });
            expect(postgrestTables(harness)).toEqual(["refunds", "payments", "payments"]);
            expect(postgrestQuery(harness, 0)).toMatchObject({ order: "created_at.desc", limit: "2" });
            expect(harness.rest.stripeRequests).toEqual([]);

            harness.rest.patchDashboardRow("refunds", Number(first.id), {
                status: "failed", failure_reason: "provider_declined",
            });
            clearProviderRequests(harness);
            const detailResponse = await harness.request("admin-1", "admin", "getProviderRefund", {
                refundId: String(first.id),
            });
            expect(detailResponse.status).toBe(200);
            expect(await responseBody(detailResponse)).toEqual(publicRefund({
                ...first, status: "failed", failure_reason: "provider_declined", updated_at: refreshedAt,
            }));
            expect(postgrestTables(harness)).toEqual(["refunds"]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });

    describe("stripe-connect dispute dashboard read contracts", () => {
        test("keeps exact fresh list/detail payloads and the current 1+3N budget", async () => {
            const harness = await createHarness();
            const first = seedDispute(harness, "dp_new", "order-dispute-new", newerAt);
            const second = seedDispute(harness, "dp_old", "order-dispute-old", olderAt);
            seedDispute(harness, "dp_outside_page", "order-dispute-outside-page", olderAt);

            clearProviderRequests(harness);
            const listedResponse = await harness.request("admin-1", "admin", "listStripeDisputes", { limit: "2" });
            expect(listedResponse.status).toBe(200);
            expect(await responseBody(listedResponse)).toEqual({
                disputes: [publicDispute(first), publicDispute(second)],
                total: 2,
            });
            expect(postgrestTables(harness)).toEqual([
                "stripe_disputes",
                "payments", "stripe_dispute_evidence", "irreversible_dispute_action_approvals",
                "payments", "stripe_dispute_evidence", "irreversible_dispute_action_approvals",
            ]);
            expect(postgrestQuery(harness, 0)).toMatchObject({ order: "created_at.desc", limit: "2" });
            expect(harness.rest.stripeRequests).toEqual([]);

            harness.rest.patchDashboardRow("stripe_disputes", Number(first.row.id), {
                status: "won", funds_withdrawn: true,
            });
            clearProviderRequests(harness);
            const detailResponse = await harness.request("admin-1", "admin", "getStripeDispute", {
                disputeId: "dp_new",
            });
            expect(detailResponse.status).toBe(200);
            expect(await responseBody(detailResponse)).toEqual(publicDispute({
                ...first,
                row: { ...first.row, status: "won", funds_withdrawn: true, updated_at: refreshedAt },
            }));
            expect(postgrestTables(harness)).toEqual([
                "stripe_disputes", "payments", "stripe_dispute_evidence",
                "irreversible_dispute_action_approvals",
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}

function refundRow(paymentId: number, requestId: string, at: string, patch: JsonRecord): JsonRecord {
    return {
        payment_id: paymentId, operation_id: paymentId + 100, refund_request_id: requestId,
        commerce_refund_request_id: paymentId + 200, stripe_charge_id: `ch_${paymentId}`,
        stripe_refund_id: `re_${paymentId}`, stripe_balance_transaction_id: null,
        amount: 400, required_reversal_amount: 300, seller_entitlement_reduction_amount: 300,
        authorized_seller_amount_after_refund: 780, currency: "eur", reason: "buyer_return",
        status: "succeeded", failure_reason: null, actual_stripe_fee_amount: -20,
        actual_stripe_net_amount: -380, actual_stripe_fee_currency: "eur",
        actual_stripe_fee_details: [{ type: "stripe_fee", amount: -20, currency: "eur" }],
        provider_snapshot: { id: `re_${paymentId}`, status: "succeeded" },
        created_at: at, updated_at: at, ...patch,
    };
}

function publicRefund(row: JsonRecord, clientReferenceId?: string): JsonRecord {
    return {
        refundId: row.id, providerOperationId: row.operation_id, paymentId: row.payment_id,
        refundRequestId: row.refund_request_id, commerceRefundRequestId: row.commerce_refund_request_id ?? null,
        stripeRefundId: row.stripe_refund_id, stripeBalanceTransactionId: row.stripe_balance_transaction_id,
        amount: row.amount, requiredReversalAmount: row.required_reversal_amount,
        sellerEntitlementReductionAmount: row.seller_entitlement_reduction_amount,
        authorizedSellerAmount: row.authorized_seller_amount_after_refund, currency: row.currency,
        reason: row.reason, status: row.status, failureReason: row.failure_reason,
        actualStripeFeeAmount: row.actual_stripe_fee_amount, actualStripeNetAmount: row.actual_stripe_net_amount,
        actualStripeFeeCurrency: row.actual_stripe_fee_currency, actualStripeFeeDetails: row.actual_stripe_fee_details,
        occurredAt: row.updated_at, providerSnapshot: row.provider_snapshot,
        createdAt: row.created_at, updatedAt: row.updated_at,
        ...(clientReferenceId ? { clientReferenceId } : {}),
    };
}

type DisputeFixture = { row: JsonRecord; paymentId: number; clientReferenceId: string; evidence: JsonRecord; approval: JsonRecord };

function seedDispute(
    harness: Awaited<ReturnType<CreateDashboardReadHarness>>,
    disputeId: string,
    clientReferenceId: string,
    at: string,
): DisputeFixture {
    const paymentId = harness.rest.seedDashboardPayment(clientReferenceId);
    const row = harness.rest.seedDashboardRow("stripe_disputes", {
        payment_id: paymentId, stripe_dispute_id: disputeId, stripe_charge_id: `ch_${paymentId}`,
        amount: 1200, currency: "eur", reason: "fraudulent", status: "needs_response",
        evidence_status: "staged", evidence_due_by: "2099-07-06T12:00:00.000Z",
        is_charge_refundable: false, funds_withdrawn: false, balance_transaction_ids: ["txn_dispute"],
        provider_snapshot: { id: disputeId }, created_at: at, updated_at: at,
    });
    const evidence = harness.rest.seedDashboardRow("stripe_dispute_evidence", {
        dispute_id: row.id, evidence_operation_id: `evidence-${disputeId}`,
        staged_at: at, submitted_at: at,
    });
    const approval = harness.rest.seedDashboardRow("irreversible_dispute_action_approvals", {
        dispute_id: row.id, action_type: "submit_evidence", status: "pending_second_approval",
        first_actor_id: "admin-first", first_approved_at: at,
        second_actor_id: null, second_approved_at: null, created_at: at,
    });
    return { row, paymentId, clientReferenceId, evidence, approval };
}

function publicDispute(fixture: DisputeFixture): JsonRecord {
    const { row, paymentId, clientReferenceId, evidence, approval } = fixture;
    return {
        id: row.stripe_dispute_id, paymentId: row.payment_id, stripeChargeId: row.stripe_charge_id,
        amount: row.amount, currency: row.currency, reason: row.reason, status: row.status,
        evidenceStatus: row.evidence_status, evidenceDueBy: row.evidence_due_by,
        isChargeRefundable: row.is_charge_refundable, fundsWithdrawn: row.funds_withdrawn,
        balanceTransactionIds: row.balance_transaction_ids, createdAt: row.created_at, updatedAt: row.updated_at,
        providerPaymentId: paymentId, clientReferenceId,
        stagedEvidenceOperationId: evidence.evidence_operation_id, stagedEvidenceAt: evidence.staged_at,
        evidenceSubmissionCount: 1, pendingApprovalAction: approval.action_type,
        firstApprovedBy: approval.first_actor_id, firstApprovedAt: approval.first_approved_at,
    };
}
