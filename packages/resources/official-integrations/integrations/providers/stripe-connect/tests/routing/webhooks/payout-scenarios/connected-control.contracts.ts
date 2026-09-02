import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import { payoutEventPayload } from "../fixtures";
import type { CreatePayoutScenarioHarness } from "./harness";

export function registerConnectedPayoutControlScenario(createHarness: CreatePayoutScenarioHarness): void {
    test("records every connected payout state and quarantines manual and instant payouts", async () => {
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
        const manualPayload = payoutEventPayload({
            eventId: "evt_manual_payout_1",
            payoutId: "po_manual_1",
            accountId: "acct_seller_example_com",
            automatic: false,
            method: "standard",
        });
        const instantPayload = payoutEventPayload({
            eventId: "evt_instant_payout_1",
            payoutId: "po_instant_1",
            accountId: "acct_seller_example_com",
            automatic: true,
            method: "instant",
        });
        for (const payload of [manualPayload, instantPayload]) {
            const signature = await stripeSignature(payload, "whsec_connect_test_456");
            await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
        }
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "connected-unsafe-payout-events",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payout_events")).toContainEqual(
            expect.objectContaining({
                stripe_payout_id: "po_manual_1",
                status: "pending",
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Unexpected manual or instant Stripe payout",
        });
        expect(
            harness.rest
                .rows("provider_exceptions")
                .filter((row) => row.exception_type === "unexpected_provider_payout"),
        ).toHaveLength(2);
    });
}
