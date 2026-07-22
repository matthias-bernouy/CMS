import { describe, expect, test } from "bun:test";
import {
    type CreateRoutingHarness,
    currentUnixTime,
    functionsBaseUrl,
    responseBody,
    stripeSignature,
} from "../harness";

const webhookRoutes = ["stripe", "stripe-connect", "stripe-connect-v2"] as const;
const platformUrl = `${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`;

export function registerStripeWebhookValidationContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect webhook validation contracts", () => {
        test("keeps all webhook routes behind the POST method guard", async () => {
            const harness = await createHarness();

            for (const route of webhookRoutes) {
                const response = await harness.edgeRequest(
                    new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/${route}`, { method: "OPTIONS" }),
                );

                expect(response.status).toBe(405);
                expect(response.headers.get("allow")).toBe("POST, OPTIONS");
                expect(await response.text()).toBe("Method Not Allowed");
            }
            expect(harness.rest.postgrestRequests).toEqual([]);
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("distinguishes malformed, stale, invalid, and raw-body signatures exactly", async () => {
            const harness = await createHarness();
            const payload = eventPayload("evt_signature_contract");
            const staleTimestamp = currentUnixTime() - 301;
            const staleSignature = await stripeSignature(payload, "whsec_test_123", staleTimestamp);
            const mismatchedBody = `${payload} `;
            const validSignature = await stripeSignature(payload, "whsec_test_123");
            const scenarios = [
                { signature: "", body: payload, error: "invalid Stripe signature header" },
                { signature: "t=invalid,v1=bad", body: payload, error: "invalid Stripe signature header" },
                { signature: staleSignature, body: payload, error: "stale Stripe webhook signature" },
                {
                    signature: `t=${currentUnixTime()},v1=bad`,
                    body: payload,
                    error: "invalid Stripe webhook signature",
                },
                { signature: validSignature, body: mismatchedBody, error: "invalid Stripe webhook signature" },
            ];

            for (const scenario of scenarios) {
                const response = await harness.edgeRequest(
                    new Request(platformUrl, {
                        method: "POST",
                        headers: scenario.signature ? { "stripe-signature": scenario.signature } : {},
                        body: scenario.body,
                    }),
                );

                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error: scenario.error });
            }
            expect(harness.rest.postgrestRequests).toEqual([]);
        });

        test("checks declared and actual payload sizes before signature parsing", async () => {
            const harness = await createHarness();
            const declared = await harness.edgeRequest(
                new Request(platformUrl, {
                    method: "POST",
                    headers: { "content-length": String(512 * 1024 + 1) },
                    body: "{}",
                }),
            );
            const actual = await harness.edgeRequest(
                new Request(platformUrl, { method: "POST", body: "x".repeat(512 * 1024 + 1) }),
            );

            for (const response of [declared, actual]) {
                expect(response.status).toBe(413);
                expect(await responseBody(response)).toEqual({ error: "Stripe webhook payload is too large" });
            }
            expect(harness.rest.postgrestRequests).toEqual([]);
        });

        test("preserves JSON, event timestamp, and signature tolerance failures", async () => {
            const harness = await createHarness();
            const invalidJson = "not-json";
            const invalidTimestamp = eventPayload("evt_invalid_timestamp", { created: null });
            const withinTolerance = eventPayload("evt_tolerance_boundary");
            const requests = [
                {
                    payload: invalidJson,
                    signature: await stripeSignature(invalidJson, "whsec_test_123"),
                    error: "invalid Stripe event JSON",
                },
                {
                    payload: invalidTimestamp,
                    signature: await stripeSignature(invalidTimestamp, "whsec_test_123"),
                    error: "Stripe event created timestamp is invalid",
                },
            ];

            for (const request of requests) {
                const response = await harness.edgeRequest(
                    new Request(platformUrl, {
                        method: "POST",
                        headers: { "stripe-signature": request.signature },
                        body: request.payload,
                    }),
                );
                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error: request.error });
            }

            const accepted = await harness.edgeRequest(
                new Request(platformUrl, {
                    method: "POST",
                    headers: {
                        "stripe-signature": await stripeSignature(
                            withinTolerance,
                            "whsec_test_123",
                            currentUnixTime() + 300,
                        ),
                    },
                    body: withinTolerance,
                }),
            );
            expect(accepted.status).toBe(202);
        });
    });
}

function eventPayload(eventId: string, patch: Record<string, unknown> = {}): string {
    return JSON.stringify({
        id: eventId,
        type: "test_helpers.test_clock.ready",
        created: currentUnixTime(),
        livemode: false,
        data: { object: { id: "clock_contract" } },
        ...patch,
    });
}
