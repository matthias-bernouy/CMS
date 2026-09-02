import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import { payoutEventPayload } from "../fixtures";
import type { CreatePayoutScenarioHarness } from "./harness";

export function registerPlatformPayoutFailureScenario(createHarness: CreatePayoutScenarioHarness): void {
    test("records an automatic failed platform payout as an operational exception", async () => {
        const harness = await createHarness();
        const payload = payoutEventPayload({
            eventId: "evt_platform_failed_1",
            payoutId: "po_platform_failed_1",
            eventType: "payout.failed",
            status: "failed",
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
                runKey: "platform-failed-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "provider_payout_failed",
                severity: "critical",
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).not.toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
            }),
        );
    });
}
