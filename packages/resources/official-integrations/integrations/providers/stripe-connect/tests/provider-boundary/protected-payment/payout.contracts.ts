import { describe, expect, test } from "bun:test";
import {
    accountSyncRequest,
    balanceSettingsRequest,
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    financialTermsHash,
    postgrestBudget,
    protectedPaymentBody,
    responseBody,
} from "../harness";
import { expectedProtectedPayment } from "./expectations";

const protectionBudget = [
    { method: "GET", table: "accounts" },
    { method: "GET", table: "accounts" },
    { method: "PATCH", table: "accounts" },
    { method: "GET", table: "payments" },
    { method: "GET", table: "platform_payout_controls" },
];

export function registerProtectedPaymentPayoutContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected payment payout boundary contracts", () => {
        test("fails closed for absent and underfunded platform payout controls", async () => {
            const cases = [
                {
                    arrange: (harness: Awaited<ReturnType<CreateProviderBoundaryHarness>>) =>
                        harness.rest.removePlatformPayoutControl(),
                    error: "platform payout protection state is unavailable",
                },
                {
                    arrange: (harness: Awaited<ReturnType<CreateProviderBoundaryHarness>>) => {
                        harness.rest.setPlatformPayoutControl({ required_minimum_amount: 300 });
                        harness.rest.setPlatformPayoutMinimum(200);
                    },
                    error: "protected payments require the current Stripe platform minimum balance",
                },
                {
                    arrange: (harness: Awaited<ReturnType<CreateProviderBoundaryHarness>>) => {
                        harness.rest.setPlatformPayoutControl({ provider_minimum_amount: 300 });
                        harness.rest.setPlatformPayoutMinimum(200);
                    },
                    error: "protected payments require the current Stripe platform minimum balance",
                },
            ];

            for (const item of cases) {
                const harness = await createHarness();
                expect((await enrollSeller(harness)).status).toBe(200);
                item.arrange(harness);
                clearRequests(harness);

                const response = await harness.submit(
                    "buyer-1",
                    "admin",
                    "createProtectedPayment",
                    protectedPaymentBody(),
                );

                expect(response.status).toBe(503);
                expect(await responseBody(response)).toEqual({ error: item.error });
                expect(postgrestBudget(harness)).toEqual(protectionBudget);
                expect(harness.rest.stripeRequests).toEqual([accountSyncRequest(), balanceSettingsRequest()]);
                expect(harness.rest.rows("payments")).toEqual([]);
                expect(harness.rest.rows("financial_operations")).toEqual([]);
            }
        });

        test("launches provider and database payout checks concurrently before reservation", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            clearRequests(harness);
            const pause = harness.rest.pauseNextPlatformBalanceSettingsRead();
            const pending = harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());

            await pause.entered;
            try {
                expect(postgrestBudget(harness)).toEqual(protectionBudget);
                expect(harness.rest.externalRequestOrder).toEqual([
                    "postgrest:GET:accounts",
                    "postgrest:GET:accounts",
                    "stripe:GET:/v2/core/accounts/acct_custom_identity_123",
                    "postgrest:PATCH:accounts",
                    "postgrest:GET:payments",
                    "stripe:GET:/v1/balance_settings",
                    "postgrest:GET:platform_payout_controls",
                ]);
                expect(harness.rest.rows("payments")).toEqual([]);
            } finally {
                pause.resume();
            }

            const response = await pending;
            const body = await responseBody(response);
            expect(response.status).toBe(200);
            expect(body).toEqual(expectedProtectedPayment(body));
            expect(postgrestBudget(harness)).toEqual([
                ...protectionBudget,
                { method: "POST", table: "rpc/reserve_protected_payment" },
                { method: "POST", table: "rpc/reserve_financial_operation" },
                { method: "PATCH", table: "financial_operations" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "PATCH", table: "financial_operations" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                {
                    method: "POST",
                    pathname: "/v1/payment_intents",
                    searchParams: [],
                    idempotencyKey: `payment:1:${financialTermsHash}`,
                    stripeAccount: null,
                },
            ]);
            expect(harness.rest.paymentIntentCreateCount).toBe(1);
            expect(harness.rest.rows("payments")).toHaveLength(1);
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({
                    business_key: `payment:1:${financialTermsHash}`,
                    status: "succeeded",
                    stripe_object_id: "pi_1",
                    attempt_count: 1,
                    next_attempt_at: null,
                }),
            ]);
        });
    });
}
