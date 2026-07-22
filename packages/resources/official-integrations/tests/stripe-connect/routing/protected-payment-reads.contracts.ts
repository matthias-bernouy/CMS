import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    cmsHeaders,
    type CreateRoutingHarness,
    createProtectedPayment,
    enrollSeller,
    functionsBaseUrl,
    postgrestBudget,
    responseBody,
    type RoutingHarness,
} from "./harness";

export function registerProtectedPaymentReadContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect protected payment read contracts", () => {
        test("preserves missing, seller-visible, and hidden read boundaries", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            const createdResponse = await createProtectedPayment(harness);
            expect(createdResponse.status).toBe(200);
            const created = await responseBody(createdResponse);
            const paymentId = Number(created.paymentId);
            const paymentIntentId = String(created.stripePaymentIntentId);

            clearRequests(harness);
            const beforeMissing = harness.rest.rows("payments");
            const missing = await get(harness, "/payments/payment?paymentId=999", "buyer-1");
            expect(missing.status).toBe(404);
            expect(await responseBody(missing)).toEqual({ error: "payment not found" });
            expect(postgrestBudget(harness)).toEqual([{ method: "GET", table: "payments" }]);
            expect(query(harness)).toMatchObject({ id: "eq.999", limit: "1" });
            expect(harness.rest.stripeRequests).toEqual([]);
            expect(harness.rest.rows("payments")).toEqual(beforeMissing);

            clearRequests(harness);
            const sellerRead = await get(harness, `/payments/payment?paymentId=${paymentId}`, "seller-1");
            expect(sellerRead.status).toBe(200);
            const sellerBody = await responseBody(sellerRead);
            const expected = Object.fromEntries(Object.entries(created).filter(([key]) => key !== "clientSecret"));
            expect(sellerBody).toEqual({
                ...expected,
                description: null,
                lastProviderSyncAt: sellerBody.lastProviderSyncAt,
                occurredAt: sellerBody.occurredAt,
                reconciliationPending: false,
                updatedAt: sellerBody.updatedAt,
            });
            expect(JSON.stringify(sellerBody)).not.toContain("clientSecret");
            expect(JSON.stringify(sellerBody)).not.toContain("sellerStripeAccountId");
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "payments" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(query(harness)).toMatchObject({ id: `eq.${paymentId}`, limit: "1" });
            expect(harness.rest.stripeRequests).toEqual([
                {
                    method: "GET",
                    pathname: `/v1/payment_intents/${paymentIntentId}`,
                    searchParams: [["expand[]", "latest_charge.balance_transaction"]],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);

            clearRequests(harness);
            const beforeHidden = harness.rest.rows("payments");
            const hidden = await get(harness, `/payments/payment?paymentId=${paymentId}`, "stranger-1");
            expect(hidden.status).toBe(403);
            expect(await responseBody(hidden)).toEqual({ error: "payment is not visible to this user" });
            expect(postgrestBudget(harness)).toEqual([{ method: "GET", table: "payments" }]);
            expect(query(harness)).toMatchObject({ id: `eq.${paymentId}`, limit: "1" });
            expect(harness.rest.stripeRequests).toEqual([]);
            expect(harness.rest.rows("payments")).toEqual(beforeHidden);

            clearRequests(harness);
            const beforeReference = harness.rest.rows("payments");
            const sellerReference = await get(
                harness,
                "/payments/reference?clientReferenceId=routing-order-1",
                "seller-1",
            );
            expect(sellerReference.status).toBe(200);
            expect(await responseBody(sellerReference)).toEqual({ exists: false });
            expect(postgrestBudget(harness)).toEqual([{ method: "GET", table: "payments" }]);
            expect(query(harness)).toMatchObject({
                client_reference_id: "eq.routing-order-1",
                limit: "1",
            });
            expect(harness.rest.stripeRequests).toEqual([]);
            expect(harness.rest.rows("payments")).toEqual(beforeReference);
        });
    });
}

async function get(harness: RoutingHarness, path: string, userId: string): Promise<Response> {
    return await harness.edgeRequest(
        new Request(`${functionsBaseUrl}/cms-stripe-connect${path}`, {
            headers: cmsHeaders(harness, userId),
        }),
    );
}

function query(harness: RoutingHarness): Record<string, string> {
    return Object.fromEntries(harness.rest.postgrestRequests[0]?.searchParams ?? []);
}
