import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";

export function registerDisputeApprovalCompletionContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect irreversible dispute completion contracts", () => {
        test("calls Stripe once for the second approval and replays the completed operation locally", async () => {
            const harness = await createHarness();
            const disputeId = "dp_approval_complete";
            const body = {
                disputeId,
                acceptanceOperationId: "approval-complete-1",
                confirmation: "ACCEPT STRIPE DISPUTE",
            };
            harness.rest.seedDispute(disputeId, "needs_response", "not_started", false);
            expect((await harness.submit("admin-1", "admin", "acceptStripeDispute", body)).status).toBe(202);
            clearRequests(harness);

            const completed = await harness.submit("admin-2", "admin", "acceptStripeDispute", body);
            const operationId = Number(harness.rest.rows("financial_operations")[0]?.id);

            expect(completed.status).toBe(200);
            expect(await responseBody(completed)).toEqual({
                disputeId,
                evidenceStatus: "accepted",
                operationId,
                approvalStatus: "approved",
                dualApprovalRequired: true,
            });
            expect(postgrestBudget(harness)).toEqual(completionBudget());
            expect(harness.rest.stripeRequests).toEqual([
                expect.objectContaining({
                    method: "POST",
                    pathname: `/v1/disputes/${disputeId}/close`,
                    stripeAccount: null,
                }),
            ]);

            clearRequests(harness);
            const replay = await harness.submit("admin-2", "admin", "acceptStripeDispute", body);

            expect(replay.status).toBe(200);
            expect(await responseBody(replay)).toEqual({ disputeId, evidenceStatus: "accepted", operationId });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "financial_operations" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("approves below the immutable payment threshold without reserving a second approval", async () => {
            const harness = await createHarness();
            const disputeId = "dp_approval_not_required";
            harness.rest.seedDispute(disputeId, "needs_response", "not_started", false);
            harness.rest.patchPaymentLedger(999, { dual_approval_threshold_amount: 2000 });
            clearRequests(harness);

            const response = await harness.submit("admin-1", "admin", "acceptStripeDispute", {
                disputeId,
                acceptanceOperationId: "approval-not-required-1",
                confirmation: "ACCEPT STRIPE DISPUTE",
            });
            const operationId = Number(harness.rest.rows("financial_operations")[0]?.id);

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual({
                disputeId,
                evidenceStatus: "accepted",
                operationId,
                approvalStatus: "not_required",
                dualApprovalRequired: false,
            });
            expect(postgrestBudget(harness)).toEqual(completionBudget());
            expect(harness.rest.rows("irreversible_dispute_action_approvals")).toEqual([]);
            expect(harness.rest.stripeRequests).toHaveLength(1);
        });
    });
}

function completionBudget(): Array<{ method: string; table: string }> {
    return [
        { method: "GET", table: "stripe_disputes" },
        { method: "GET", table: "financial_operations" },
        { method: "POST", table: "rpc/authorize_irreversible_dispute_action" },
        { method: "POST", table: "rpc/reserve_financial_operation" },
        { method: "PATCH", table: "financial_operations" },
        { method: "PATCH", table: "financial_operations" },
        { method: "PATCH", table: "stripe_disputes" },
        { method: "POST", table: "payment_events" },
    ];
}
