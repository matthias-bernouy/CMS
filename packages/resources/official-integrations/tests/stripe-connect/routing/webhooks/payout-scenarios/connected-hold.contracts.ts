import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import { payoutEventPayload } from "../fixtures";
import type { CreatePayoutScenarioHarness } from "./harness";

export function registerConnectedPayoutHoldScenario(createHarness: CreatePayoutScenarioHarness): void {
    test("quarantines a connected automatic payout during an emergency seller hold", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        harness.rest.seedEmergencySellerHold("seller-1", 250);
        const payload = payoutEventPayload({
            eventId: "evt_connected_automatic_hold_1",
            payoutId: "po_connected_automatic_hold_1",
            accountId: "acct_seller_example_com",
            automatic: true,
            method: "standard",
        });
        const signature = await stripeSignature(payload, "whsec_connect_test_456");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "connected-automatic-payout-emergency-hold",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Automatic payout conflicts with an emergency seller hold",
        });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "unexpected_provider_payout",
                severity: "critical",
                message: "Stripe reported an automatic payout during an emergency seller hold",
            }),
        );
    });
}
