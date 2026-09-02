import { describe, expect, test } from "bun:test";
import { cmsHeaders, type CreateRoutingHarness, functionsBaseUrl, responseBody } from "./harness";

const route = `${functionsBaseUrl}/cms-stripe-connect/reconciliation/run`;

export function registerProviderReconciliationRunRoutingContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect provider reconciliation run routing contracts", () => {
        test("preserves authentication and validation before external work", async () => {
            const harness = await createHarness();
            const headers = cmsHeaders(harness, "system-reconciliation");
            const requests = [
                {
                    request: new Request(route, {
                        method: "POST",
                        body: JSON.stringify({ runKey: "unauthenticated" }),
                    }),
                    status: 401,
                    error: "invalid CMS API key",
                },
                {
                    request: new Request(route, { method: "POST", headers, body: "{" }),
                    status: 400,
                    error: "invalid JSON body",
                },
                {
                    request: new Request(route, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ runKey: "unknown-key", unexpected: true }),
                    }),
                    status: 400,
                    error: "unexpected is not allowed",
                },
                {
                    request: new Request(route, { method: "POST", headers, body: JSON.stringify({}) }),
                    status: 400,
                    error: "runKey is required",
                },
                {
                    request: new Request(route, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ runKey: "invalid-limit", limit: 0 }),
                    }),
                    status: 400,
                    error: "limit must be positive",
                },
            ];

            for (const scenario of requests) {
                const response = await harness.edgeRequest(scenario.request);
                expect(response.status).toBe(scenario.status);
                expect(await responseBody(response)).toEqual({ error: scenario.error });
            }
            expect(harness.rest.postgrestRequests).toEqual([]);
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("trims the run key and caps every public page budget at 200", async () => {
            const harness = await createHarness();
            const response = await harness.edgeRequest(
                new Request(route, {
                    method: "POST",
                    headers: cmsHeaders(harness, "system-reconciliation"),
                    body: JSON.stringify({ runKey: "  capped-run  ", limit: 500 }),
                }),
            );
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                runKey: "capped-run",
                status: "succeeded",
                scannedCount: 0,
                repairedCount: 0,
                exceptionCount: 0,
                details: { workBudgetLimit: 200, workBudgetConsumed: 0 },
                payments: [],
                operations: [],
                commerceOperations: [],
                disputes: [],
            });
            const operationPage = harness.rest.postgrestRequests.find(
                ({ table }) => table === "rpc/read_reconciliation_operations",
            );
            const projectionPage = harness.rest.postgrestRequests.find(
                ({ table }) => table === "rpc/claim_reconciliation_projection_batch",
            );
            expect(operationPage?.body).toEqual({ p_limit: 200 });
            expect(projectionPage?.body).toEqual({ p_owner: "commerce:capped-run", p_limit: 200 });
        });
    });
}
