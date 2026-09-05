import { expect, test } from "bun:test";
import { marketplaceTermsHash } from "../../runtime/constants";
import { jsonBody, okJson } from "../../runtime/http";
import { sourceJson, sourceRequest } from "../../runtime/source-requests";
import type { CreateAccountSourceScenarioHarness } from "./harness";

export function registerAccountEnrollmentSourceScenario(createHarness: CreateAccountSourceScenarioHarness): void {
    test("enrolls a French seller without a bank account and keeps marketplace consent immutable and replayable", async () => {
        const harness = await createHarness();
        const version = "marketplace-seller-2026-07";

        const missingConsent = await sourceJson(harness, "enrollConnectSeller", {
            accountToken: "accttok_test_identity_123",
            marketplaceTermsVersion: version,
            marketplaceTermsHash,
        });
        expect(missingConsent.status).toBe(409);
        expect(await jsonBody(missingConsent)).toEqual({ error: "current marketplace terms acceptance is required" });
        expect(harness.rest.rows("accounts")).toHaveLength(0);

        const enrolled = await okJson(
            await sourceJson(harness, "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );
        expect(enrolled).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            stripeAccountApiVersion: "v2",
            accountStatus: "active",
            termsStatus: "accepted",
            stripeTermsStatus: "accepted",
            marketplaceTermsStatus: "accepted",
            marketplaceTermsCurrentVersionAccepted: true,
            enrollmentStatus: "enrolled",
            stripeTransfersStatus: "active",
            bankAccountStatus: "not_attached",
            bankPayoutsStatus: "unrequested",
            payoutsEnabled: false,
            canAcceptHeldPayments: true,
            canReceiveProtectedPayments: true,
            payoutBankReady: false,
        });
        expect(enrolled).not.toHaveProperty("commerceVerified");
        expect(harness.rest.rows("marketplace_terms_acceptances")).toEqual([
            {
                cms_user_id: "user-123",
                terms_version: version,
                terms_hash: marketplaceTermsHash,
                accepted_at: "2026-07-06T12:03:00.000Z",
            },
        ]);

        const replayed = await okJson(
            await sourceJson(harness, "enrollConnectSeller", {
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );
        expect(replayed).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            marketplaceTermsCurrentVersionAccepted: true,
            enrollmentStatus: "enrolled",
        });
        expect(harness.rest.rows("marketplace_terms_acceptances")).toHaveLength(1);

        const currentStatus = await okJson(
            await sourceRequest(harness, "getConnectStatus", {
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );
        const futureStatus = await okJson(
            await sourceRequest(harness, "getConnectStatus", {
                marketplaceTermsVersion: "marketplace-seller-2026-08",
                marketplaceTermsHash: "d".repeat(64),
            }),
        );
        expect(currentStatus.marketplaceTermsCurrentVersionAccepted).toBeTrue();
        expect(futureStatus.marketplaceTermsCurrentVersionAccepted).toBeFalse();

        const unacceptedUpdate = await sourceJson(harness, "enrollConnectSeller", {
            marketplaceTermsVersion: "marketplace-seller-2026-08",
            marketplaceTermsHash: "d".repeat(64),
        });
        expect(unacceptedUpdate.status).toBe(409);

        const acceptedUpdate = await okJson(
            await sourceJson(harness, "enrollConnectSeller", {
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: "marketplace-seller-2026-08",
                marketplaceTermsHash: "d".repeat(64),
            }),
        );
        expect(acceptedUpdate).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            marketplaceTermsCurrentVersionAccepted: true,
            enrollmentStatus: "enrolled",
        });
        expect(harness.rest.rows("marketplace_terms_acceptances")).toHaveLength(2);

        const conflictingHash = await sourceJson(harness, "enrollConnectSeller", {
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: "marketplace-seller-2026-08",
            marketplaceTermsHash: "e".repeat(64),
        });
        expect(conflictingHash.status).toBe(409);
        expect(await jsonBody(conflictingHash)).toEqual({
            error: "marketplace terms version is already bound to another document hash",
        });

        const bankReady = await okJson(
            await sourceJson(harness, "submitConnectVerification", {
                bankAccountToken: "btok_test_iban_123",
            }),
        );
        expect(bankReady).toMatchObject({
            stripeAccountId: "acct_custom_identity_123",
            bankAccountStatus: "attached",
            bankPayoutsStatus: "active",
            payoutsEnabled: true,
            payoutBankReady: true,
        });
        expect(harness.rest.rows("accounts")).toHaveLength(1);
    });
}
