import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "../harness";

const disputeId = "dp_evidence_staging";
const evidenceOperationId = "stage-contract-1";
const validBody = { disputeId, evidenceOperationId, evidenceText: "Tracked shipment evidence" };

export function registerDisputeStagingContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect dispute evidence staging contracts", () => {
        test("rejects non-admin actors and unknown request keys before database access", async () => {
            const harness = await seededHarness(createHarness);
            const denied = await harness.submit("support-1", "support", "stageStripeDisputeEvidence", validBody);

            expect(denied.status).toBe(403);
            expect(await responseBody(denied)).toEqual({ error: "the CMS admin role is required" });
            expect(postgrestBudget(harness)).toEqual([]);

            clearRequests(harness);
            const unknownKey = await harness.submit("admin-1", "admin", "stageStripeDisputeEvidence", {
                ...validBody,
                providerSnapshot: {},
            });

            expect(unknownKey.status).toBe(400);
            expect(await unknownKey.text()).toBe("body.providerSnapshot is not allowed");
            expect(postgrestBudget(harness)).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("validates evidence keys, file ids, emptiness, and field limits before staging", async () => {
            const harness = await seededHarness(createHarness);
            const invalidCases = [
                {
                    body: { disputeId, evidenceOperationId, evidence: { secret_note: "no" } },
                    error: "unsupported Stripe evidence field: secret_note",
                },
                {
                    body: { disputeId, evidenceOperationId, receiptFileId: "not-a-file" },
                    error: "Stripe evidence field receipt requires a Stripe file id",
                },
                {
                    body: { disputeId, evidenceOperationId, evidence: {} },
                    error: "at least one evidence field is required",
                },
                {
                    body: { disputeId, evidenceOperationId, evidenceText: "x".repeat(20_001) },
                    error: "Stripe evidence field uncategorized_text must be a non-empty string",
                },
            ];

            for (const invalid of invalidCases) {
                clearRequests(harness);
                const response = await harness.submit("admin-1", "admin", "stageStripeDisputeEvidence", invalid.body);
                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error: invalid.error });
                expect(postgrestBudget(harness)).toEqual([{ method: "GET", table: "stripe_disputes" }]);
                expect(harness.rest.stripeRequests).toEqual([]);
                expect(harness.rest.rows("payment_events")).toEqual([]);
            }
        });

        test("normalizes and persists exact evidence once, then replays without writes", async () => {
            const harness = await seededHarness(createHarness);
            const body = {
                disputeId,
                evidenceOperationId,
                evidence: { billing_address: "  10 Test Street  " },
                evidenceText: "  The parcel was delivered.  ",
                customerCommunicationFileId: "file_customer_1",
                shippingTrackingNumber: "  TRACK-123  ",
                receiptFileId: "file_receipt_1",
                customerEmailAddress: "  buyer@example.com  ",
            };

            const staged = await harness.submit("admin-1", "admin", "stageStripeDisputeEvidence", body);

            expect(staged.status).toBe(200);
            expect(await responseBody(staged)).toEqual({
                evidenceOperationId,
                disputeId,
                status: "staged",
                stagedAt: "2026-07-06T12:05:00.000Z",
            });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "stripe_dispute_evidence" },
                { method: "POST", table: "stripe_dispute_evidence" },
                { method: "PATCH", table: "stripe_disputes" },
                { method: "POST", table: "payment_events" },
            ]);
            expect(stagedEvidence(harness)).toMatchObject({
                evidence_operation_id: evidenceOperationId,
                staged_by: "admin-1",
                evidence: {
                    billing_address: "10 Test Street",
                    uncategorized_text: "The parcel was delivered.",
                    customer_communication: "file_customer_1",
                    shipping_tracking_number: "TRACK-123",
                    receipt: "file_receipt_1",
                    customer_email_address: "buyer@example.com",
                },
            });
            expect(harness.rest.rows("payment_events")).toEqual([
                expect.objectContaining({
                    event_type: "stripe_dispute_evidence_staged",
                    actor_kind: "admin",
                    actor_id: "admin-1",
                    data: { disputeId, evidenceOperationId },
                }),
            ]);

            clearRequests(harness);
            const replay = await harness.submit("admin-1", "admin", "stageStripeDisputeEvidence", body);
            expect(replay.status).toBe(200);
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "stripe_dispute_evidence" },
            ]);
            expect(harness.rest.rows("payment_events")).toHaveLength(1);

            clearRequests(harness);
            const mismatch = await harness.submit("admin-1", "admin", "stageStripeDisputeEvidence", {
                ...body,
                evidenceText: "Changed evidence",
            });
            expect(mismatch.status).toBe(409);
            expect(await responseBody(mismatch)).toEqual({ error: "dispute evidence replay mismatch" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "stripe_dispute_evidence" },
            ]);
        });

        test("preserves the inserted evidence and stops when dispute persistence fails", async () => {
            const harness = await seededHarness(createHarness);
            harness.rest.failNextPostgrestWrite("stripe_disputes", "PATCH");

            const response = await harness.submit("admin-1", "admin", "stageStripeDisputeEvidence", validBody);

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({ error: "simulated stripe_disputes PATCH failure" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "GET", table: "stripe_dispute_evidence" },
                { method: "POST", table: "stripe_dispute_evidence" },
                { method: "PATCH", table: "stripe_disputes" },
            ]);
            expect(stagedEvidence(harness)).toMatchObject({ evidence_operation_id: evidenceOperationId });
            expect(harness.rest.rows("payment_events")).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}

function stagedEvidence(harness: Awaited<ReturnType<CreateProviderBoundaryHarness>>) {
    return harness.rest
        .rows("stripe_dispute_evidence")
        .find((row) => row.evidence_operation_id === evidenceOperationId);
}

async function seededHarness(createHarness: CreateProviderBoundaryHarness) {
    const harness = await createHarness();
    harness.rest.seedDispute(disputeId, "needs_response", "not_started", false);
    clearRequests(harness);
    return harness;
}
