import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    cmsHeaders,
    type CreateRoutingHarness,
    enrollSeller,
    functionsBaseUrl,
    marketplaceTermsHash,
    marketplaceTermsVersion,
    postgrestBudget,
    protectedPaymentBody,
    responseBody,
    type RoutingHarness,
} from "./harness";

export function registerProtectedPaymentValidationContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect protected payment validation contracts", () => {
        test("requires either configured terms or a complete legacy identity before seller state access", async () => {
            const harness = await createHarness();
            const absent = await postJson(harness, "/payments/seller-eligibility", "buyer-1", {
                sellerUserId: "seller-1",
            });
            expect(absent.status).toBe(409);
            expect(await responseBody(absent)).toEqual({ error: "current marketplace terms are not configured" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/get_current_marketplace_terms_configuration" },
            ]);

            const cases = [
                {
                    body: { sellerUserId: "seller-1", marketplaceTermsVersion },
                    error: "marketplaceTermsVersion and marketplaceTermsHash must be provided together",
                },
                {
                    body: { sellerUserId: "seller-1", marketplaceTermsHash },
                    error: "marketplaceTermsVersion and marketplaceTermsHash must be provided together",
                },
            ];

            for (const item of cases) {
                clearRequests(harness);
                const response = await postJson(harness, "/payments/seller-eligibility", "buyer-1", item.body);

                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error: item.error });
                expect(postgrestBudget(harness)).toEqual([]);
                expect(harness.rest.stripeRequests).toEqual([]);
                expect(harness.rest.rows("payments")).toEqual([]);
                expect(harness.rest.rows("financial_operations")).toEqual([]);
            }
        });

        test("rejects invalid creation values and malformed bodies without side effects", async () => {
            const harness = await createHarness();
            const cases = [
                { patch: { amountTotal: 0 }, error: "amountTotal must be positive" },
                { patch: { amountTotal: -1 }, error: "amountTotal must be positive" },
                {
                    patch: { sellerTransferAmount: -1 },
                    error: "sellerTransferAmount must be between zero and amountTotal",
                },
                {
                    patch: { sellerTransferAmount: 1201 },
                    error: "sellerTransferAmount must be between zero and amountTotal",
                },
                { patch: { currency: "usd" }, error: "protected C2C payments support EUR only" },
                {
                    patch: { dualApprovalThresholdAmount: -1 },
                    error: "dualApprovalThresholdAmount must be non-negative",
                },
                { patch: { unexpected: true }, error: "unexpected is not allowed" },
            ];

            for (const item of cases) {
                clearRequests(harness);
                const response = await postJson(
                    harness,
                    "/payments/protected",
                    "buyer-1",
                    protectedPaymentBody(item.patch),
                );

                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error: item.error });
                assertNoPaymentSideEffects(harness);
            }

            clearRequests(harness);
            const malformed = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/payments/protected`, {
                    method: "POST",
                    headers: cmsHeaders(harness, "buyer-1"),
                    body: "{",
                }),
            );
            expect(malformed.status).toBe(400);
            expect(await responseBody(malformed)).toEqual({ error: "invalid JSON body" });
            assertNoPaymentSideEffects(harness);
        });

        test("rejects self-purchase after account refresh but before payment work", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            clearRequests(harness);

            const response = await postJson(harness, "/payments/protected", "seller-1", protectedPaymentBody());

            expect(response.status).toBe(400);
            expect(await responseBody(response)).toEqual({ error: "buyer and seller must be different users" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "accounts" },
                { method: "GET", table: "accounts" },
                { method: "PATCH", table: "accounts" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                {
                    method: "GET",
                    pathname: "/v2/core/accounts/acct_custom_identity_123",
                    searchParams: [
                        ["include[0]", "configuration.recipient"],
                        ["include[1]", "defaults"],
                        ["include[2]", "identity"],
                        ["include[3]", "requirements"],
                    ],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(harness.rest.rows("payments")).toEqual([]);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
        });
    });
}

async function postJson(harness: RoutingHarness, path: string, userId: string, body: unknown): Promise<Response> {
    return await harness.edgeRequest(
        new Request(`${functionsBaseUrl}/cms-stripe-connect${path}`, {
            method: "POST",
            headers: cmsHeaders(harness, userId),
            body: JSON.stringify(body),
        }),
    );
}

function assertNoPaymentSideEffects(harness: RoutingHarness): void {
    expect(postgrestBudget(harness)).toEqual([]);
    expect(harness.rest.stripeRequests).toEqual([]);
    expect(harness.rest.rows("payments")).toEqual([]);
    expect(harness.rest.rows("financial_operations")).toEqual([]);
}
