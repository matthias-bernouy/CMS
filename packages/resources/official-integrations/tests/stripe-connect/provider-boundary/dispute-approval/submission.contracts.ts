import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";

export function registerDisputeApprovalSubmissionContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect irreversible dispute submission contracts", () => {
        test("keeps the exact staged response and database budget for a first approval", async () => {
            const harness = await createHarness();
            const disputeId = "dp_approval_submission";
            harness.rest.seedDispute(disputeId, "needs_response", "staged", false);
            clearRequests(harness);

            const response = await harness.submit("admin-1", "admin", "submitStripeDisputeEvidence", {
                disputeId,
                submissionOperationId: "approval-submit-1",
                evidenceOperationId: `evidence-${disputeId}`,
                confirmation: "SUBMIT STRIPE EVIDENCE",
            });

            expect(response.status).toBe(202);
            expect(await responseBody(response)).toEqual({
                disputeId,
                evidenceStatus: "staged",
                approvalStatus: "pending_second_approval",
                dualApprovalRequired: true,
                firstApprovedBy: "admin-1",
            });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "stripe_dispute_evidence" },
                { method: "GET", table: "financial_operations" },
                { method: "GET", table: "payments" },
                { method: "POST", table: "rpc/authorize_irreversible_dispute_action" },
                { method: "POST", table: "payment_events" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("rejects a changed approval payload before any provider call", async () => {
            const harness = await createHarness();
            const disputeId = "dp_approval_mismatch";
            const submissionOperationId = "approval-mismatch-1";
            harness.rest.seedDispute(disputeId, "needs_response", "staged", false);
            expect(
                (
                    await harness.submit("admin-1", "admin", "submitStripeDisputeEvidence", {
                        disputeId,
                        submissionOperationId,
                        evidenceOperationId: `evidence-${disputeId}`,
                        confirmation: "SUBMIT STRIPE EVIDENCE",
                    })
                ).status,
            ).toBe(202);
            expect(
                (
                    await harness.submit("admin-1", "admin", "stageStripeDisputeEvidence", {
                        disputeId,
                        evidenceOperationId: "evidence-approval-mismatch-alternate",
                        evidenceText: "Alternate evidence",
                    })
                ).status,
            ).toBe(200);
            clearRequests(harness);

            const mismatch = await harness.submit("admin-2", "admin", "submitStripeDisputeEvidence", {
                disputeId,
                submissionOperationId,
                evidenceOperationId: "evidence-approval-mismatch-alternate",
                confirmation: "SUBMIT STRIPE EVIDENCE",
            });

            expect(mismatch.status).toBe(409);
            expect(await responseBody(mismatch)).toEqual({
                error: "irreversible dispute approval replay mismatch",
            });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "stripe_dispute_evidence" },
                { method: "GET", table: "financial_operations" },
                { method: "GET", table: "payments" },
                { method: "POST", table: "rpc/authorize_irreversible_dispute_action" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}
