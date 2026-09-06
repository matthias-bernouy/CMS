import { describe, expect, test } from "bun:test";
import { type CreateRoutingHarness, functionsBaseUrl, responseBody } from "./harness";

export function registerStripeConnectRoutingContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect routing contracts", () => {
        test("preserves routing, method, authentication, and authorization responses", async () => {
            const harness = await createHarness();
            const cmsHeaders = {
                authorization: `Bearer ${harness.apiKey}`,
                "x-cms-user-id": "user-123",
            };

            const options = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/payments/protected`, {
                    method: "OPTIONS",
                }),
            );
            const wrongMethod = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/payments/protected`, {
                    method: "GET",
                    headers: cmsHeaders,
                }),
            );
            const unknown = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/unknown`, { headers: cmsHeaders }),
            );
            const unauthenticated = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/payments`),
            );
            const forbidden = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/payments`, {
                    headers: { ...cmsHeaders, "x-cms-user-role": "member" },
                }),
            );

            expect(options.status).toBe(200);
            expect(await options.text()).toBe("ok");
            expect(wrongMethod.status).toBe(405);
            expect(wrongMethod.headers.get("allow")).toBe("POST, OPTIONS");
            expect(await wrongMethod.text()).toBe("Method Not Allowed");
            expect(unknown.status).toBe(404);
            expect(await responseBody(unknown)).toEqual({ error: "not found" });
            expect(unauthenticated.status).toBe(401);
            expect(await responseBody(unauthenticated)).toEqual({ error: "invalid CMS API key" });
            expect(forbidden.status).toBe(403);
            expect(await responseBody(forbidden)).toEqual({ error: "the CMS admin role is required" });
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("routes health identically with and without the function marker", async () => {
            const harness = await createHarness();
            const headers = { authorization: `Bearer ${harness.apiKey}` };

            const marked = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/health/`, { headers }),
            );
            const direct = await harness.edgeRequest(new Request("https://project.supabase.co/health", { headers }));

            expect(marked.status).toBe(200);
            expect(await responseBody(marked)).toMatchObject({ schemaVersion: 1, status: "unknown" });
            expect(direct.status).toBe(200);
            expect(await responseBody(direct)).toMatchObject({ schemaVersion: 1, status: "unknown" });
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("dispatches the administrator onboarding route and preserves its method guard", async () => {
            const harness = await createHarness();
            const url = `${functionsBaseUrl}/cms-stripe-connect/admin/accounts/account/onboarding?userId=seller-route`;
            const headers = {
                authorization: `Bearer ${harness.apiKey}`,
                "content-type": "application/json",
            };

            const dispatched = await harness.edgeRequest(
                new Request(url, { method: "POST", headers, body: JSON.stringify({}) }),
            );
            const wrongMethod = await harness.edgeRequest(new Request(url, { method: "GET", headers }));

            expect(dispatched.status).toBe(400);
            expect(await responseBody(dispatched)).toEqual({ error: "returnUrl is required" });
            expect(wrongMethod.status).toBe(405);
            expect(wrongMethod.headers.get("allow")).toBe("POST, OPTIONS");
            expect(await wrongMethod.text()).toBe("Method Not Allowed");
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("keeps webhook preflight behind the POST method guard", async () => {
            const harness = await createHarness();
            const normal = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/payments/protected`, {
                    method: "OPTIONS",
                }),
            );
            const webhook = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                    method: "OPTIONS",
                }),
            );

            expect(normal.status).toBe(200);
            expect(await normal.text()).toBe("ok");
            expect(webhook.status).toBe(405);
            expect(webhook.headers.get("allow")).toBe("POST, OPTIONS");
            expect(await webhook.text()).toBe("Method Not Allowed");
            expect(harness.providerRequestCount()).toBe(0);
        });
    });
}
