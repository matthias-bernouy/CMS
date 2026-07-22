import { describe, expect, test } from "bun:test";
import {
    accountSyncRequest,
    balanceSettingsRequest,
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    expectedProtectedPayment,
    paymentIntentRequest,
    postgrestBody,
    postgrestBudget,
    protectedPaymentBody,
    responseBody,
    type ProviderBoundaryHarness,
} from "../harness";

const accountSyncBudget = [
    { method: "GET", table: "accounts" },
    { method: "GET", table: "accounts" },
    { method: "PATCH", table: "accounts" },
    { method: "GET", table: "payments" },
];

export function registerProtectedPaymentReplayContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected payment replay boundary contracts", () => {
        test("replays a nonterminal payment through protection, sync, and a second secret read", async () => {
            const { harness } = await fixture(createHarness);
            const operations = harness.rest.rows("financial_operations");
            clearRequests(harness);

            const response = await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedProtectedPayment(body));
            expect(postgrestBudget(harness)).toEqual([
                ...accountSyncBudget,
                { method: "GET", table: "platform_payout_controls" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(postgrestBody(harness, 5).p_projection).toMatchObject({
                kind: "apply",
                stripePaymentIntentId: "pi_1",
            });
            expect(harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentRequest("pi_1"),
                paymentIntentRequest("pi_1"),
            ]);
            expect(harness.rest.paymentIntentCreateCount).toBe(1);
            expect(harness.rest.rows("payments")).toHaveLength(1);
            expect(harness.rest.rows("payments")[0]).toMatchObject({ stripe_payment_intent_id: "pi_1" });
            expect(harness.rest.rows("financial_operations")).toEqual(operations);
        });

        test("replays a succeeded payment without reading platform balance settings", async () => {
            const { harness } = await fixture(createHarness);
            harness.rest.setPaymentIntentSucceeded("pi_1");
            const synchronized = await harness.request("buyer-1", "admin", "getProtectedPayment", {
                paymentId: "1",
            });
            expect(synchronized.status).toBe(200);
            const operations = harness.rest.rows("financial_operations");
            clearRequests(harness);

            const response = await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedPayment(body, {
                    stripeChargeId: "ch_1",
                    stripeChargeBalanceTransactionId: "txn_charge_1",
                    actualStripeChargeFeeAmount: 65,
                    actualStripeProcessingFeeAmount: 65,
                    actualStripeChargeNetAmount: 1135,
                    actualStripeFeeCurrency: "eur",
                    actualStripeChargeFeeDetails: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
                    actualPlatformMarginAfterStripeAmount: 55,
                    paymentStatus: "succeeded",
                    commercePaymentStatus: "succeeded",
                    paidAt: body.paidAt,
                }),
            );
            expect(postgrestBudget(harness)).toEqual([
                ...accountSyncBudget,
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                paymentIntentRequest("pi_1"),
                paymentIntentRequest("pi_1"),
            ]);
            expect(harness.rest.paymentIntentCreateCount).toBe(1);
            expect(harness.rest.rows("financial_operations")).toEqual(operations);
        });

        test("rejects an immutable replay mismatch before payout or PaymentIntent access", async () => {
            const { harness } = await fixture(createHarness);
            const payments = harness.rest.rows("payments");
            const operations = harness.rest.rows("financial_operations");
            clearRequests(harness);

            const response = await harness.submit(
                "buyer-1",
                "admin",
                "createProtectedPayment",
                protectedPaymentBody({ amountTotal: 1201 }),
            );

            expect(response.status).toBe(409);
            expect(await responseBody(response)).toEqual({
                error: "protected payment replay does not match immutable financial terms",
            });
            expect(postgrestBudget(harness)).toEqual(accountSyncBudget);
            expect(harness.rest.stripeRequests).toEqual([accountSyncRequest()]);
            expect(harness.rest.paymentIntentCreateCount).toBe(1);
            expect(harness.rest.rows("payments")).toEqual(payments);
            expect(harness.rest.rows("financial_operations")).toEqual(operations);
        });
    });
}

async function fixture(createHarness: CreateProviderBoundaryHarness): Promise<{ harness: ProviderBoundaryHarness }> {
    const harness = await createHarness();
    expect((await enrollSeller(harness)).status).toBe(200);
    const created = await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
    expect(created.status).toBe(200);
    const body = await responseBody(created);
    expect(body).toEqual(expectedProtectedPayment(body));
    return { harness };
}
