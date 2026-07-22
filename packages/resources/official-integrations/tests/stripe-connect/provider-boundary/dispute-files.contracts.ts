import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "./harness";

const disputeId = "dp_file_upload";
const validBody = {
    disputeId,
    fileName: "delivery-proof.pdf",
    mimeType: "application/pdf",
    base64: Buffer.from([0, 1, 2, 254, 255]).toString("base64"),
};

export function registerDisputeFileProviderBoundaryContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect dispute file provider boundary contracts", () => {
        test("refuses non-admin uploads and validates files without provider or event side effects", async () => {
            const harness = await seededHarness(createHarness);
            const denied = await harness.submit("support-1", "support", "uploadStripeDisputeFile", validBody);

            expect(denied.status).toBe(403);
            expect(await responseBody(denied)).toEqual({ error: "the CMS admin role is required" });
            expect(postgrestBudget(harness)).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);
            expect(harness.rest.rows("payment_events")).toEqual([]);

            const invalidCases = [
                {
                    body: { ...validBody, mimeType: "text/plain" },
                    status: 400,
                    error: "unsupported dispute evidence file type",
                },
                {
                    body: { ...validBody, base64: "%%%" },
                    status: 400,
                    error: "base64 evidence is invalid",
                },
                {
                    body: {
                        ...validBody,
                        base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
                    },
                    status: 413,
                    error: "dispute evidence file is too large",
                },
            ];

            for (const invalid of invalidCases) {
                clearRequests(harness);
                const response = await harness.submit("admin-1", "admin", "uploadStripeDisputeFile", invalid.body);
                expect(response.status).toBe(invalid.status);
                expect(await responseBody(response)).toEqual({ error: invalid.error });
                expect(postgrestBudget(harness)).toEqual([{ method: "GET", table: "stripe_disputes" }]);
                expect(harness.rest.stripeRequests).toEqual([]);
                expect(harness.rest.rows("payment_events")).toEqual([]);
            }
        });

        test("uploads exact dispute evidence once and records the resulting payment event", async () => {
            const harness = await seededHarness(createHarness);

            const response = await harness.submit("admin-1", "admin", "uploadStripeDisputeFile", validBody);

            expect(response.status).toBe(201);
            expect(await responseBody(response)).toEqual({
                fileId: "file_dispute_1",
                fileName: "delivery-proof.pdf",
                purpose: "dispute_evidence",
            });
            expect(harness.rest.fileUploadRequests).toEqual([
                {
                    purpose: "dispute_evidence",
                    fileName: "delivery-proof.pdf",
                    mimeType: "application/pdf",
                    content: [0, 1, 2, 254, 255],
                },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                {
                    method: "POST",
                    pathname: "/v1/files",
                    searchParams: [],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "stripe_disputes" },
                { method: "POST", table: "payment_events" },
            ]);
            const events = harness.rest.rows("payment_events");
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                payment_id: 999,
                event_type: "stripe_dispute_file_uploaded",
                actor_kind: "admin",
                actor_id: "admin-1",
            });
            expect(events[0]?.data).toEqual({
                disputeId,
                stripeFileId: "file_dispute_1",
                fileName: "delivery-proof.pdf",
            });
        });
    });
}

async function seededHarness(createHarness: CreateProviderBoundaryHarness) {
    const harness = await createHarness();
    harness.rest.seedDispute(disputeId, "needs_response", "not_started", false);
    return harness;
}
