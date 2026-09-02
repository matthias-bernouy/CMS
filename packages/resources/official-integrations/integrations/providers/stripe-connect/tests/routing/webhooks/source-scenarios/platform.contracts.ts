import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerPlatformWebhookSourceScenario(createHarness: CreateHarness): void {
    test("verifies and durably deduplicates raw Stripe webhooks", async () => {
        const harness = await createHarness();
        const payload = JSON.stringify({
            id: "evt_unknown_1",
            type: "test_helpers.test_clock.ready",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "clock_1" } },
        });
        const signature = await stripeSignature(payload, "whsec_test_123");
        const url = `${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`;
        const invalid = await harness.edgeRequest(
            new Request(url, {
                method: "POST",
                headers: { "stripe-signature": "t=1,v1=bad" },
                body: payload,
            }),
        );
        expect(invalid.status).toBe(400);

        const first = await harness.edgeRequest(
            new Request(url, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        const repeated = await harness.edgeRequest(
            new Request(url, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        expect(first.status).toBe(202);
        expect(repeated.status).toBe(200);
        expect(await repeated.json()).toEqual({ received: true, duplicate: true });
        expect(harness.rest.rows("stripe_events")).toHaveLength(1);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "stripe-reconciliation-1",
                limit: 25,
            }),
        );
        expect(reconciliation).toMatchObject({
            runKey: "stripe-reconciliation-1",
            status: "succeeded",
            scannedCount: 1,
            repairedCount: 0,
            exceptionCount: 0,
            details: { processedStripeEvents: 1, recoveredFinancialOperations: 0 },
        });
        expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
            processing_status: "ignored",
            attempt_count: 1,
            processing_started_at: null,
        });
    });
}
