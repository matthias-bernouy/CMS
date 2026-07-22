import { describe, expect, test } from "bun:test";
import { cmsHeaders, type CreateRoutingHarness, functionsBaseUrl, responseBody } from "./harness";

const route = `${functionsBaseUrl}/cms-stripe-connect/reconciliation/payment`;

export function registerPaymentReconciliationRoutingContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect payment reconciliation routing contracts", () => {
        test("preserves authentication and body validation before database or provider access", async () => {
            const harness = await createHarness();
            const headers = cmsHeaders(harness, "system-reconciliation");

            const unauthenticated = await harness.edgeRequest(
                new Request(route, { method: "POST", body: JSON.stringify({ paymentId: 1 }) }),
            );
            const malformed = await harness.edgeRequest(new Request(route, { method: "POST", headers, body: "{" }));
            const unknownKey = await harness.edgeRequest(
                new Request(route, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ paymentId: 1, unexpected: true }),
                }),
            );
            const missingPaymentId = await harness.edgeRequest(
                new Request(route, { method: "POST", headers, body: JSON.stringify({}) }),
            );

            expect(unauthenticated.status).toBe(401);
            expect(await responseBody(unauthenticated)).toEqual({ error: "invalid CMS API key" });
            expect(malformed.status).toBe(400);
            expect(await responseBody(malformed)).toEqual({ error: "invalid JSON body" });
            expect(unknownKey.status).toBe(400);
            expect(await responseBody(unknownKey)).toEqual({ error: "unexpected is not allowed" });
            expect(missingPaymentId.status).toBe(400);
            expect(await responseBody(missingPaymentId)).toEqual({ error: "paymentId must be an integer" });
            expect(harness.rest.postgrestRequests).toEqual([]);
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("preserves the missing-payment boundary before provider access", async () => {
            const harness = await createHarness();
            const missing = await harness.edgeRequest(
                new Request(route, {
                    method: "POST",
                    headers: cmsHeaders(harness, "system-reconciliation"),
                    body: JSON.stringify({ paymentId: 999_999 }),
                }),
            );

            expect(missing.status).toBe(404);
            expect(await responseBody(missing)).toEqual({ error: "payment not found" });
            expect(harness.rest.postgrestRequests.map(({ method, table }) => [method, table])).toEqual([
                ["GET", "payments"],
            ]);
            expect(harness.providerRequestCount()).toBe(0);
        });
    });
}
