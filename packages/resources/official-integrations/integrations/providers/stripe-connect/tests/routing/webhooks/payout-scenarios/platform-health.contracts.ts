import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import { payoutEventPayload } from "../fixtures";
import type { CreatePayoutScenarioHarness } from "./harness";

export function registerPlatformPayoutHealthScenarios(createHarness: CreatePayoutScenarioHarness): void {
    test("accepts a normal automatic platform payout and records it without a critical exception", async () => {
        const harness = await createHarness();
        const payload = payoutEventPayload({
            eventId: "evt_platform_automatic_1",
            payoutId: "po_platform_automatic_1",
            automatic: true,
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
                runKey: "platform-automatic-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")).toContainEqual(
            expect.objectContaining({
                stripe_account_id: "platform",
                stripe_payout_id: "po_platform_automatic_1",
                status: "pending",
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("quarantines an automatic platform payout when payout protection has drifted", async () => {
        const harness = await createHarness();
        harness.rest.setPlatformPayoutInterval("manual");
        const payload = payoutEventPayload({
            eventId: "evt_platform_automatic_drift_1",
            payoutId: "po_platform_automatic_drift_1",
            automatic: true,
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
                runKey: "platform-automatic-payout-drift",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
                severity: "critical",
                message: "Stripe reported an automatic platform payout while payout protection had drifted",
            }),
        );
    });
}
