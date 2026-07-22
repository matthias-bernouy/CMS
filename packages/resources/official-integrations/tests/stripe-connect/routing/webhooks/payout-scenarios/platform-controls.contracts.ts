import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import { payoutEventPayload } from "../fixtures";
import type { CreatePayoutScenarioHarness } from "./harness";

export function registerPlatformPayoutControlScenarios(createHarness: CreatePayoutScenarioHarness): void {
    test("quarantines manual and instant platform payouts", async () => {
        const harness = await createHarness();
        const manualPayload = payoutEventPayload({
            eventId: "evt_platform_manual_1",
            payoutId: "po_platform_manual_1",
            automatic: false,
            method: "standard",
        });
        const instantPayload = payoutEventPayload({
            eventId: "evt_platform_instant_1",
            payoutId: "po_platform_instant_1",
            automatic: true,
            method: "instant",
        });
        for (const payload of [manualPayload, instantPayload]) {
            const signature = await stripeSignature(payload, "whsec_test_123");
            await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
        }
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-unsafe-payout-events",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")).toHaveLength(2);
        expect(
            harness.rest
                .rows("provider_exceptions")
                .filter((row) => row.exception_type === "unexpected_provider_payout"),
        ).toHaveLength(2);
    });

    test("retrieves current provider truth when a payout event omits automatic", async () => {
        const harness = await createHarness();
        harness.rest.setProviderPayout({
            id: "po_platform_retrieved_1",
            amount: 1000,
            currency: "eur",
            status: "paid",
            automatic: true,
            method: "standard",
        });
        const payload = payoutEventPayload({
            eventId: "evt_platform_retrieved_1",
            payoutId: "po_platform_retrieved_1",
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_test_123");

        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-retrieved-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")[0]).toMatchObject({
            stripe_payout_id: "po_platform_retrieved_1",
            status: "paid",
            provider_snapshot: { automatic: true, method: "standard" },
        });
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });
}
