import { describe, expect, test } from "bun:test";
import {
    clearProviderRequests,
    newerAt,
    olderAt,
    postgrestBody,
    postgrestTables,
    refreshedAt,
    responseBody,
    type CreateDashboardReadHarness,
    type JsonRecord,
} from "../dashboard-contract-harness";

export function registerDisputeDashboardContracts(createHarness: CreateDashboardReadHarness): void {
    describe("stripe-connect dispute dashboard read contracts", () => {
        test("keeps exact fresh list/detail payloads with one PostgREST read each", async () => {
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
            expect(postgrestTables(harness)).toEqual(["rpc/read_dashboard_disputes"]);
            expect(postgrestBody(harness, 0)).toEqual({
                p_actor_id: "admin-1",
                p_actor_kind: "admin",
                p_limit: 2,
                p_search: null,
                p_status: null,
                p_dispute_id: null,
            });
            expect(harness.rest.stripeRequests).toEqual([]);

            harness.rest.patchDashboardRow("stripe_disputes", Number(first.row.id), {
                status: "won",
                funds_withdrawn: true,
            });
            clearProviderRequests(harness);
            const detailResponse = await harness.request("admin-1", "admin", "getStripeDispute", {
                disputeId: "dp_new",
            });
            expect(detailResponse.status).toBe(200);
            expect(await responseBody(detailResponse)).toEqual(
                publicDispute({
                    ...first,
                    row: { ...first.row, status: "won", funds_withdrawn: true, updated_at: refreshedAt },
                }),
            );
            expect(postgrestTables(harness)).toEqual(["rpc/read_dashboard_disputes"]);
            expect(postgrestBody(harness, 0)).toEqual({
                p_actor_id: "admin-1",
                p_actor_kind: "admin",
                p_limit: 1,
                p_search: null,
                p_status: null,
                p_dispute_id: "dp_new",
            });
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}

type DisputeFixture = {
    row: JsonRecord;
    paymentId: number;
    clientReferenceId: string;
    evidence: JsonRecord;
    approval: JsonRecord;
};

function seedDispute(
    harness: Awaited<ReturnType<CreateDashboardReadHarness>>,
    disputeId: string,
    clientReferenceId: string,
    at: string,
): DisputeFixture {
    const paymentId = harness.rest.seedDashboardPayment(clientReferenceId);
    const row = harness.rest.seedDashboardRow("stripe_disputes", {
        payment_id: paymentId,
        stripe_dispute_id: disputeId,
        stripe_charge_id: `ch_${paymentId}`,
        amount: 1200,
        currency: "eur",
        reason: "fraudulent",
        status: "needs_response",
        evidence_status: "staged",
        evidence_due_by: "2099-07-06T12:00:00.000Z",
        is_charge_refundable: false,
        funds_withdrawn: false,
        balance_transaction_ids: ["txn_dispute"],
        provider_snapshot: { id: disputeId },
        created_at: at,
        updated_at: at,
    });
    const evidence = harness.rest.seedDashboardRow("stripe_dispute_evidence", {
        dispute_id: row.id,
        evidence_operation_id: `evidence-${disputeId}`,
        staged_at: at,
        submitted_at: at,
    });
    const approval = harness.rest.seedDashboardRow("irreversible_dispute_action_approvals", {
        dispute_id: row.id,
        action_type: "dispute_evidence_submit",
        status: "pending_second_approval",
        first_actor_id: "admin-first",
        first_approved_at: at,
        second_actor_id: null,
        second_approved_at: null,
        created_at: at,
    });
    return { row, paymentId, clientReferenceId, evidence, approval };
}

function publicDispute(fixture: DisputeFixture): JsonRecord {
    const { row, paymentId, clientReferenceId, evidence, approval } = fixture;
    return {
        id: row.stripe_dispute_id,
        paymentId: row.payment_id,
        stripeChargeId: row.stripe_charge_id,
        amount: row.amount,
        currency: row.currency,
        reason: row.reason,
        status: row.status,
        evidenceStatus: row.evidence_status,
        evidenceDueBy: row.evidence_due_by,
        isChargeRefundable: row.is_charge_refundable,
        fundsWithdrawn: row.funds_withdrawn,
        balanceTransactionIds: row.balance_transaction_ids,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        providerPaymentId: paymentId,
        clientReferenceId,
        stagedEvidenceOperationId: evidence.evidence_operation_id,
        stagedEvidenceAt: evidence.staged_at,
        evidenceSubmissionCount: 1,
        pendingApprovalAction: approval.action_type,
        firstApprovedBy: approval.first_actor_id,
        firstApprovedAt: approval.first_approved_at,
    };
}
