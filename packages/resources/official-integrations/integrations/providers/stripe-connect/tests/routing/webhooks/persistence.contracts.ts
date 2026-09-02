import { describe, expect, test } from "bun:test";
import {
    type CreateRoutingHarness,
    currentUnixTime,
    functionsBaseUrl,
    responseBody,
    sha256,
    stripeSignature,
} from "../harness";
import { baseEvent, webhookCases } from "./fixtures";

export function registerStripeWebhookPersistenceContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect webhook persistence contracts", () => {
        test("authenticates and durably replays every Stripe webhook boundary", async () => {
            const harness = await createHarness();
            const created = currentUnixTime();
            const createdIso = new Date(created * 1000).toISOString();
            const cases = webhookCases(created);

            for (const scenario of cases) {
                const payload = JSON.stringify(scenario.event);
                const signature = await stripeSignature(payload, scenario.secret);
                const url = `${functionsBaseUrl}/cms-stripe-connect/webhooks/${scenario.route}`;
                const first = await harness.edgeRequest(
                    new Request(url, { method: "POST", headers: { "stripe-signature": signature }, body: payload }),
                );
                const replay = await harness.edgeRequest(
                    new Request(url, { method: "POST", headers: { "stripe-signature": signature }, body: payload }),
                );

                expect(first.status).toBe(202);
                expect(await responseBody(first)).toEqual({ received: true, duplicate: false });
                expect(replay.status).toBe(200);
                expect(await responseBody(replay)).toEqual({ received: true, duplicate: true });
                expect(harness.rest.rows("stripe_events")).toContainEqual(
                    expect.objectContaining({
                        stripe_account_id: scenario.accountId,
                        event_id: scenario.event.id,
                        event_type: scenario.event.type,
                        object_id: scenario.objectId,
                        provider_created_at: createdIso,
                        payload_sha256: await sha256(payload),
                        payload: scenario.event,
                        processing_status: "pending",
                    }),
                );
            }
            expect(harness.rest.rows("stripe_events")).toHaveLength(3);
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("rejects events sent to the wrong endpoint scope with exact errors", async () => {
            const harness = await createHarness();
            const created = currentUnixTime();
            const scenarios = [
                {
                    route: "stripe",
                    secret: "whsec_test_123",
                    event: { ...baseEvent("evt_wrong_platform", created), account: "acct_connected" },
                    error: "connected-account event sent to platform Stripe webhook",
                },
                {
                    route: "stripe-connect",
                    secret: "whsec_connect_test_456",
                    event: baseEvent("evt_wrong_connect", created),
                    error: "platform event sent to Stripe Connect webhook",
                },
                {
                    route: "stripe-connect-v2",
                    secret: "whsec_connect_v2_test_789",
                    event: {
                        ...baseEvent("evt_wrong_connect_v2", created),
                        related_object: { id: "acct_v2", type: "v2.core.account" },
                    },
                    error: "non-account event sent to Stripe Connect v2 webhook",
                },
            ];

            for (const scenario of scenarios) {
                const payload = JSON.stringify(scenario.event);
                const response = await harness.edgeRequest(
                    new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/${scenario.route}`, {
                        method: "POST",
                        headers: { "stripe-signature": await stripeSignature(payload, scenario.secret) },
                        body: payload,
                    }),
                );
                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error: scenario.error });
            }
            expect(harness.rest.rows("stripe_events")).toEqual([]);
        });

        test("surfaces a durable insert failure before processing", async () => {
            const harness = await createHarness();
            const payload = JSON.stringify(baseEvent("evt_insert_failure", currentUnixTime()));
            harness.rest.failNextPostgrestWrite("stripe_events", "POST");

            const response = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                    method: "POST",
                    headers: { "stripe-signature": await stripeSignature(payload, "whsec_test_123") },
                    body: payload,
                }),
            );

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({ error: "simulated stripe_events POST failure" });
            expect(harness.rest.rows("stripe_events")).toEqual([]);
            expect(harness.providerRequestCount()).toBe(0);
        });

        test("defers processing until reconciliation claims the durable event", async () => {
            const harness = await createHarness();
            const payload = JSON.stringify(baseEvent("evt_deferred_processing", currentUnixTime()));
            const ingested = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                    method: "POST",
                    headers: { "stripe-signature": await stripeSignature(payload, "whsec_test_123") },
                    body: payload,
                }),
            );

            expect(ingested.status).toBe(202);
            expect(harness.rest.rows("stripe_events")[0]).toMatchObject({ processing_status: "pending" });
            expect(harness.providerRequestCount()).toBe(0);

            const processed = await harness.submit("admin-1", "admin", "runProviderReconciliation", {
                runKey: "webhook-processing-contract",
                limit: 25,
            });
            expect(processed.status).toBe(200);
            expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
                processing_status: "ignored",
                attempt_count: 1,
                processing_started_at: null,
            });
        });
    });
}
