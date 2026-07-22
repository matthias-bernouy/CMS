import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";

export function registerDisputeApprovalFailureContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect irreversible dispute approval failures", () => {
        test("rejects a non-admin actor before database and provider access", async () => {
            const harness = await createHarness();
            harness.rest.seedDispute("dp_approval_denied", "needs_response", "not_started", false);
            clearRequests(harness);

            const response = await harness.submit("support-1", "support", "acceptStripeDispute", {
                disputeId: "dp_approval_denied",
                acceptanceOperationId: "approval-denied-1",
                confirmation: "ACCEPT STRIPE DISPUTE",
            });

            expect(response.status).toBe(403);
            expect(await responseBody(response)).toEqual({ error: "the CMS admin role is required" });
            expect(postgrestBudget(harness)).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("keeps confirmation and terminal errors ahead of the payment lookup", async () => {
            const harness = await createHarness();
            harness.rest.seedDispute("dp_approval_terminal", "won", "closed", false);
            harness.rest.removePayment(999);
            clearRequests(harness);

            const invalidConfirmation = await harness.submit("admin-1", "admin", "acceptStripeDispute", {
                disputeId: "dp_approval_terminal",
                acceptanceOperationId: "approval-terminal-1",
                confirmation: "NO",
            });

            expect(invalidConfirmation.status).toBe(400);
            expect(await responseBody(invalidConfirmation)).toEqual({
                error: "explicit dispute acceptance confirmation is required",
            });
            expect(postgrestBudget(harness)).toEqual([{ method: "GET", table: "stripe_disputes" }]);

            clearRequests(harness);
            const terminal = await harness.submit("admin-1", "admin", "acceptStripeDispute", {
                disputeId: "dp_approval_terminal",
                acceptanceOperationId: "approval-terminal-1",
                confirmation: "ACCEPT STRIPE DISPUTE",
            });

            expect(terminal.status).toBe(409);
            expect(await responseBody(terminal)).toEqual({ error: "Stripe dispute is already terminal" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "financial_operations" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("keeps the missing payment 404 after the operation lookup and before approval", async () => {
            const harness = await createHarness();
            harness.rest.seedDispute("dp_approval_missing_payment", "needs_response", "not_started", false);
            harness.rest.removePayment(999);
            clearRequests(harness);

            const response = await harness.submit("admin-1", "admin", "acceptStripeDispute", {
                disputeId: "dp_approval_missing_payment",
                acceptanceOperationId: "approval-missing-payment-1",
                confirmation: "ACCEPT STRIPE DISPUTE",
            });

            expect(response.status).toBe(404);
            expect(await responseBody(response)).toEqual({ error: "payment not found" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "financial_operations" },
                { method: "GET", table: "payments" },
            ]);
            expect(harness.rest.rows("irreversible_dispute_action_approvals")).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}
