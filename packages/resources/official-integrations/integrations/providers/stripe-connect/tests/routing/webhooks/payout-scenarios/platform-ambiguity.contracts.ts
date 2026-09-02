import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import { payoutEventPayload } from "../fixtures";
import type { CreatePayoutScenarioHarness } from "./harness";

export function registerPlatformPayoutAmbiguityScenario(createHarness: CreatePayoutScenarioHarness): void {
    test("fails closed when payout control mode remains ambiguous", async () => {
        const harness = await createHarness();
        const payload = payoutEventPayload({
            eventId: "evt_platform_ambiguous_1",
            payoutId: "po_platform_ambiguous_1",
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
                runKey: "platform-ambiguous-payout-event",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
                severity: "critical",
                message: "Stripe payout control mode could not be verified",
            }),
        );

        const recoveredPayload = payoutEventPayload({
            eventId: "evt_platform_ambiguous_recovered_1",
            payoutId: "po_platform_ambiguous_1",
            eventType: "payout.paid",
            status: "paid",
            automatic: true,
            method: "standard",
        });
        const recoveredSignature = await stripeSignature(recoveredPayload, "whsec_test_123");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": recoveredSignature },
                body: recoveredPayload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "platform-ambiguous-payout-recovered",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("provider_exceptions")[0]).toMatchObject({
            exception_type: "unexpected_provider_payout",
            status: "resolved",
            resolved_by: "provider-reconciliation",
        });
    });
}
