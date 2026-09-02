import { expect, test } from "bun:test";
import { jsonBody, okJson } from "../../runtime/http";
import { sourceJson, sourceRequest } from "../../runtime/source-requests";
import type { CreateAccountSourceScenarioHarness } from "./harness";

export function registerAccountOnboardingSourceScenarios(createHarness: CreateAccountSourceScenarioHarness): void {
    test("keeps verification requirements visible when payouts were already enabled", async () => {
        const harness = await createHarness();

        await okJson(
            await sourceJson(harness, "createOnboardingSession", {
                email: "seller@example.com",
            }),
        );
        harness.rest.setStripeAccountState("user-123", {
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

        const status = await okJson(await sourceRequest(harness, "getConnectStatus"));

        expect(status).toMatchObject({
            payoutsEnabled: true,
            onboardingStatus: "requirements_due",
            currentlyDue: ["identity.individual.documents.primary_verification"],
        });
    });

    test("creates a hosted verification fallback for the authenticated seller", async () => {
        const harness = await createHarness();

        const link = await okJson(
            await sourceJson(harness, "createOnboardingLink", {
                email: "seller@example.com",
                returnUrl: "https://market.example/account/payouts",
                refreshUrl: "https://market.example/account/payouts",
            }),
        );

        expect(link).toMatchObject({
            userId: "user-123",
            onboardingStatus: "link_created",
            url: "https://connect.stripe.test/onboard",
        });
    });

    test("creates one immutable application-controlled recipient across onboarding replays", async () => {
        const harness = await createHarness();
        const request = { email: "seller@example.com", country: "FR" };

        await okJson(await sourceJson(harness, "createOnboardingSession", request));
        await okJson(await sourceJson(harness, "createOnboardingSession", request));

        expect(harness.rest.accountCreationRequests).toHaveLength(1);
        expect(harness.rest.accountCreationRequests[0]).toMatchObject({
            body: {
                dashboard: "none",
                defaults: {
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
            },
            idempotencyKey: expect.stringMatching(/^cms_connect_account_v2_controlled_recipient_v2_/),
        });
    });

    test("replaces incomplete legacy v1 accounts before onboarding", async () => {
        const harness = await createHarness();

        harness.rest.seedLegacyRecipientAccount("user-123");
        const repaired = await okJson(
            await sourceJson(harness, "createOnboardingSession", {
                email: "seller@example.com",
            }),
        );

        expect(repaired.stripeAccountId).toBe("acct_seller_example_com");
        expect(repaired.stripeAccountApiVersion).toBe("v2");
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            stripe_account_id: "acct_seller_example_com",
            stripe_account_api_version: "v2",
        });
    });

    test("requires an email for new recipients and rejects unsafe legacy payout access", async () => {
        const fresh = await createHarness();
        const missingEmail = await sourceJson(fresh, "createOnboardingSession", {});

        expect(missingEmail.status).toBe(400);
        expect(await jsonBody(missingEmail)).toEqual({
            error: "email is required to create a Stripe recipient account",
        });

        const legacy = await createHarness();
        legacy.rest.seedActiveLegacyAccount("user-123");
        const session = await sourceJson(legacy, "createOnboardingSession", {});

        expect(session.status).toBe(409);
        expect(await jsonBody(session)).toEqual({
            error: "email is required to replace a recipient account with unsafe payout access",
        });
    });

    test("rejects a browser country override outside the pinned French recipient scope", async () => {
        const harness = await createHarness();

        const response = await sourceJson(harness, "createOnboardingSession", {
            email: "seller@example.com",
            country: "DE",
        });

        expect(response.status).toBe(400);
        expect(await jsonBody(response)).toEqual({
            error: "country must be FR for this integration version",
        });
        expect(harness.rest.rows("accounts")).toHaveLength(0);
    });
}
