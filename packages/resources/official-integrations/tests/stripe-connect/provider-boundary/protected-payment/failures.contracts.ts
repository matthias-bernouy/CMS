import { describe, expect, test } from "bun:test";
import {
    accountSyncRequest,
    balanceSettingsRequest,
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    financialTermsHash,
    postgrestBody,
    postgrestBudget,
    protectedPaymentBody,
    responseBody,
    type ProviderBoundaryHarness,
} from "../harness";
import { expectedProtectedPayment } from "./expectations";

const processingBudget = [
    { method: "GET", table: "accounts" },
    { method: "GET", table: "accounts" },
    { method: "PATCH", table: "accounts" },
    { method: "GET", table: "payments" },
    { method: "GET", table: "platform_payout_controls" },
    { method: "POST", table: "rpc/reserve_protected_payment" },
    { method: "POST", table: "rpc/reserve_financial_operation" },
    { method: "PATCH", table: "financial_operations" },
];

export function registerProtectedPaymentFailureContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected payment failure contracts", () => {
        test("marks Stripe creation and initial projection failures for an exact retry", async () => {
            const cases = [
                {
                    arrange: (harness: ProviderBoundaryHarness) => harness.rest.failNextPaymentIntentCreationOnce(),
                    error: "simulated Stripe PaymentIntent creation failure",
                    responseError: "provider request failed",
                    projectionBudget: [] as Array<{ method: string; table: string }>,
                    createCount: 0,
                },
                {
                    arrange: (harness: ProviderBoundaryHarness) => harness.rest.failNextPaymentProjectionEnqueue(),
                    error: "simulated payment projection enqueue failure",
                    responseError: "simulated payment projection enqueue failure",
                    projectionBudget: [{ method: "POST", table: "rpc/apply_payment_provider_projection" }],
                    createCount: 1,
                },
            ];

            for (const item of cases) {
                const harness = await preparedHarness(createHarness);
                item.arrange(harness);

                const response = await createPayment(harness);

                expect(response.status).toBe(502);
                expect(await responseBody(response)).toEqual({ error: item.responseError });
                expect(postgrestBudget(harness)).toEqual([
                    ...processingBudget,
                    ...item.projectionBudget,
                    { method: "PATCH", table: "financial_operations" },
                ]);
                const failurePatch = postgrestBody(harness, harness.rest.postgrestRequests.length - 1);
                expect(failurePatch).toEqual({
                    status: "failed",
                    last_error: item.error,
                    next_attempt_at: failurePatch.next_attempt_at,
                });
                expect(failurePatch.next_attempt_at).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
                expect(harness.rest.stripeRequests).toEqual([
                    accountSyncRequest(),
                    balanceSettingsRequest(),
                    paymentIntentCreateRequest(),
                ]);
                expect(harness.rest.paymentIntentCreateCount).toBe(item.createCount);
                expect(harness.rest.rows("payments")[0]).toMatchObject({
                    payment_status: "created",
                    stripe_payment_intent_id: null,
                });
                expect(harness.rest.rows("financial_operations")).toEqual([
                    expect.objectContaining({
                        status: "failed",
                        stripe_object_id: null,
                        last_error: item.error,
                        attempt_count: 1,
                        next_attempt_at: failurePatch.next_attempt_at,
                    }),
                ]);
            }
        });

        test("preserves the Stripe error when its best-effort failure update also fails", async () => {
            const harness = await preparedHarness(createHarness);
            harness.rest.failNextPaymentIntentCreationOnce();
            harness.rest.failNextFinancialOperationFailureUpdate();

            const response = await createPayment(harness);

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({ error: "provider request failed" });
            expect(postgrestBudget(harness)).toEqual([
                ...processingBudget,
                { method: "PATCH", table: "financial_operations" },
            ]);
            expect(postgrestBody(harness, 8)).toEqual({
                status: "failed",
                last_error: "simulated Stripe PaymentIntent creation failure",
                next_attempt_at: postgrestBody(harness, 8).next_attempt_at,
            });
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({ status: "processing", last_error: null, next_attempt_at: null }),
            ]);
        });

        test("keeps the exact initial provider review on the operation and payment", async () => {
            const harness = await preparedHarness(createHarness);
            harness.rest.quarantineNextPaymentIntentProjection();
            const reason = "Stripe payment provider truth mismatch: latest_charge_expansion";

            const response = await createPayment(harness);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedPayment(body, {
                    paymentStatus: "failed",
                    commercePaymentStatus: "manual_review",
                    settlementStatus: "manual_review",
                    manualReviewReason: reason,
                }),
            );
            expect(postgrestBudget(harness)).toEqual([
                ...processingBudget,
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "PATCH", table: "financial_operations" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentCreateRequest(),
            ]);
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({
                    status: "manual_review",
                    stripe_object_id: "pi_1",
                    last_error: reason,
                    attempt_count: 1,
                    next_attempt_at: null,
                }),
            ]);
            expect(harness.rest.rows("provider_exceptions")).toEqual([
                expect.objectContaining({
                    deduplication_key: "provider-payment-truth:1:pi_1",
                    exception_type: "provider_payment_truth_mismatch",
                    status: "open",
                    message: reason,
                    details: { paymentIntentId: "pi_1", chargeId: null, mismatches: ["latest_charge_expansion"] },
                }),
            ]);
        });
    });
}

async function preparedHarness(createHarness: CreateProviderBoundaryHarness): Promise<ProviderBoundaryHarness> {
    const harness = await createHarness();
    expect((await enrollSeller(harness)).status).toBe(200);
    clearRequests(harness);
    return harness;
}

async function createPayment(harness: ProviderBoundaryHarness): Promise<Response> {
    return await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
}

function paymentIntentCreateRequest() {
    return {
        method: "POST",
        pathname: "/v1/payment_intents",
        searchParams: [],
        idempotencyKey: `payment:1:${financialTermsHash}`,
        stripeAccount: null,
    };
}
