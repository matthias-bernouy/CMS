import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerConnectedWebhookSourceScenarios(createHarness: CreateHarness): void {
    test("uses a distinct signing secret and route for connected-account events", async () => {
        const harness = await createHarness();
        const payload = JSON.stringify({
            id: "evt_connect_account_1",
            type: "account.updated",
            account: "acct_connected_1",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "acct_connected_1" } },
        });
        const platformSignature = await stripeSignature(payload, "whsec_test_123");
        const connectSignature = await stripeSignature(payload, "whsec_connect_test_456");
        const connectUrl = `${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect`;
        const platformUrl = `${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`;

        const wrongSecret = await harness.edgeRequest(
            new Request(connectUrl, {
                method: "POST",
                headers: { "stripe-signature": platformSignature },
                body: payload,
            }),
        );
        const wrongScope = await harness.edgeRequest(
            new Request(platformUrl, {
                method: "POST",
                headers: { "stripe-signature": platformSignature },
                body: payload,
            }),
        );
        const accepted = await harness.edgeRequest(
            new Request(connectUrl, {
                method: "POST",
                headers: { "stripe-signature": connectSignature },
                body: payload,
            }),
        );

        expect(wrongSecret.status).toBe(400);
        expect(wrongScope.status).toBe(400);
        expect(accepted.status).toBe(202);
        expect(harness.rest.rows("stripe_events")).toContainEqual(
            expect.objectContaining({
                stripe_account_id: "acct_connected_1",
                event_id: "evt_connect_account_1",
                event_type: "account.updated",
            }),
        );
    });

    test("retrieves current Accounts v2 state from a signed thin event", async () => {
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
        harness.rest.setStripeAccountState("seller-1", {
            requirements: {
                entries: [
                    {
                        awaiting_action_from: "user",
                        description: "identity.individual.documents.primary_verification",
                        errors: [],
                        minimum_deadline: { status: "currently_due" },
                    },
                ],
                summary: { minimum_deadline: { status: "currently_due" } },
            },
        });
        const payload = JSON.stringify({
            id: "evt_v2_requirements_1",
            object: "v2.core.event",
            type: "v2.core.account[requirements].updated",
            created: new Date().toISOString(),
            livemode: false,
            context: "acct_seller_example_com",
            related_object: {
                id: "acct_seller_example_com",
                type: "v2.core.account",
                url: "/v2/core/accounts/acct_seller_example_com",
            },
        });
        const signature = await stripeSignature(payload, "whsec_connect_v2_test_789");

        const ingested = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe-connect-v2`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "accounts-v2-thin-event",
                limit: 25,
            }),
        );

        expect(ingested.status).toBe(202);
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            stripe_account_api_version: "v2",
            application_controlled_recipient: true,
            onboarding_status: "requirements_due",
            requirements_currently_due: ["identity.individual.documents.primary_verification"],
        });
        expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
            stripe_account_id: "acct_seller_example_com",
            object_id: "acct_seller_example_com",
            event_type: "v2.core.account[requirements].updated",
            processing_status: "processed",
        });
    });
}
