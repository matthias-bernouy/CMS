import { expect, test } from "bun:test";
import { okJson } from "../../runtime/http";
import { sourceJson } from "../../runtime/source-requests";
import type { CreateAccountSourceScenarioHarness } from "./harness";

export function registerAccountVerificationSourceScenarios(createHarness: CreateAccountSourceScenarioHarness): void {
    test("accepts an optional contact email while Stripe identity stays inside the Account Token", async () => {
        const harness = await createHarness();

        const rejectedPii = await sourceJson(harness, "submitConnectVerification", {
            accountToken: "accttok_test_identity_123",
            bankAccountToken: "btok_test_iban_123",
            contactEmail: "seller@example.com",
            givenName: "Ada",
        });
        expect(rejectedPii.status).toBe(400);
        expect(await rejectedPii.text()).toBe("body.givenName is not allowed");

        const verified = await okJson(
            await sourceJson(harness, "submitConnectVerification", {
                accountToken: "accttok_test_identity_123",
                bankAccountToken: "btok_test_iban_123",
                contactEmail: "seller@example.com",
            }),
        );

        expect(verified).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            stripeAccountApiVersion: "v2",
            country: "FR",
            businessType: "individual",
            payoutsEnabled: true,
            onboardingStatus: "enabled",
        });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            cms_user_id: "user-123",
            stripe_account_id: "acct_custom_identity_123",
            stripe_account_api_version: "v2",
        });
    });

    test("replaces an incomplete Stripe-hosted v2 account with the custom French account", async () => {
        const harness = await createHarness();
        harness.rest.seedHostedV2AccountWithRequirements("user-123");

        const verified = await okJson(
            await sourceJson(harness, "submitConnectVerification", {
                accountToken: "accttok_test_identity_123",
                bankAccountToken: "btok_test_iban_123",
                contactEmail: "seller@example.com",
            }),
        );

        expect(verified.stripeAccountId).toBe("acct_custom_identity_123");
        expect(harness.rest.rows("accounts")[0]?.stripe_account_id).toBe("acct_custom_identity_123");
    });
}
