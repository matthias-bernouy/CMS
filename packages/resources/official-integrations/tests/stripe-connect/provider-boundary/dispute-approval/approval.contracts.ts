import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";

const disputeId = "dp_approval_pending";
const acceptance = {
    disputeId,
    acceptanceOperationId: "approval-pending-1",
    confirmation: "ACCEPT STRIPE DISPUTE",
};

export function registerDisputeApprovalContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect irreversible dispute approval contracts", () => {
        test("keeps the first approval pending and idempotent without calling Stripe", async () => {
            const harness = await createHarness();
            harness.rest.seedDispute(disputeId, "needs_response", "not_started", false);
            clearRequests(harness);

            const first = await harness.submit("admin-1", "admin", "acceptStripeDispute", acceptance);

            expect(first.status).toBe(202);
            expect(await responseBody(first)).toEqual({
                disputeId,
                evidenceStatus: "not_started",
                approvalStatus: "pending_second_approval",
                dualApprovalRequired: true,
                firstApprovedBy: "admin-1",
            });
            expect(postgrestBudget(harness)).toEqual(pendingApprovalBudget());
            expect(harness.rest.stripeRequests).toEqual([]);
            expect(harness.rest.rows("irreversible_dispute_action_approvals")).toHaveLength(1);

            clearRequests(harness);
            const replay = await harness.submit("admin-1", "admin", "acceptStripeDispute", acceptance);

            expect(replay.status).toBe(202);
            expect(await responseBody(replay)).toEqual({
                disputeId,
                evidenceStatus: "not_started",
                approvalStatus: "pending_second_approval",
                dualApprovalRequired: true,
                firstApprovedBy: "admin-1",
            });
            expect(postgrestBudget(harness)).toEqual(pendingApprovalBudget());
            expect(harness.rest.stripeRequests).toEqual([]);
            expect(harness.rest.rows("irreversible_dispute_action_approvals")).toHaveLength(1);
        });
    });
}

function pendingApprovalBudget(): Array<{ method: string; table: string }> {
    return [
        { method: "GET", table: "stripe_disputes" },
        { method: "GET", table: "financial_operations" },
        { method: "GET", table: "payments" },
        { method: "POST", table: "rpc/authorize_irreversible_dispute_action" },
        { method: "POST", table: "payment_events" },
    ];
}
