import { expect, test } from "bun:test";
import { financialTermsHash, functionsBaseUrl, marketplaceTermsHash } from "../../runtime/constants";
import { activeEnv } from "../../runtime/environment";
import type { StripeConnectHarness } from "../../runtime/harness";
import { jsonBody, okJson } from "../../runtime/http";
import { sourceJson, sourceJsonWithUser, sourceRequest, sourceRequestWithUser } from "../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerProtectedPaymentEligibilitySourceScenarios(createHarness: CreateHarness): void {
    test("rejects ineligible sellers and hidden payments", async () => {
        const harness = await createHarness();

        const ineligible = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "missing-seller",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "missing-order",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });
        const sellerSession = await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const payment = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "private-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const hidden = await sourceRequestWithUser(harness, "stranger", "getProtectedPayment", {
            paymentId: String(payment.paymentId),
        });

        expect(sellerSession.connected).toBe(true);
        expect(ineligible.status).toBe(409);
        expect(await jsonBody(ineligible)).toEqual({
            error: "seller enrollment does not allow a held platform payment",
        });
        expect(hidden.status).toBe(403);
        expect(await jsonBody(hidden)).toEqual({ error: "payment is not visible to this user" });
    });

    test("preflights the exact current seller terms without creating a payment", async () => {
        const harness = await createHarness();
        const version = "courtside-seller-2026-07";
        const requestEligibility = async (
            sellerUserId: string,
            buyerUserId = "buyer-1",
            termsVersion = version,
            termsHash = marketplaceTermsHash,
        ) =>
            harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/payments/seller-eligibility`, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                        "x-user-id": buyerUserId,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        sellerUserId,
                        marketplaceTermsVersion: termsVersion,
                        marketplaceTermsHash: termsHash,
                    }),
                }),
            );

        const missing = await requestEligibility("missing-seller");
        expect(missing.status).toBe(200);
        expect(await jsonBody(missing)).toEqual({ eligible: false, reasonCode: "seller_account_missing" });

        await okJson(
            await sourceJsonWithUser(harness, "seller-1", "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: version,
                marketplaceTermsHash,
            }),
        );

        const eligible = await requestEligibility("seller-1");
        const staleTerms = await requestEligibility("seller-1", "buyer-1", "courtside-seller-2026-08", "d".repeat(64));
        const selfPurchase = await requestEligibility("seller-1", "seller-1");

        expect(await jsonBody(eligible)).toEqual({ eligible: true, reasonCode: "eligible" });
        expect(await jsonBody(staleTerms)).toEqual({ eligible: false, reasonCode: "seller_terms_not_current" });
        expect(await jsonBody(selfPurchase)).toEqual({ eligible: false, reasonCode: "buyer_is_seller" });
        expect(harness.rest.rows("payments")).toHaveLength(0);
        expect(JSON.stringify(await jsonBody(await requestEligibility("seller-1")))).not.toContain("acct_");
    });

    test("derives protected-payment eligibility from the exact application-controlled account state", async () => {
        const safe = await createHarness();
        await okJson(
            await sourceJson(
                safe,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const safeStatus = await okJson(await sourceRequestWithUser(safe, "seller-1", "getConnectStatus"));
        expect(safeStatus).toMatchObject({
            stripeAccountApiVersion: "v2",
            applicationControlledRecipient: true,
            canReceiveProtectedPayments: true,
        });

        safe.rest.exposeSellerFinancialRisk("seller-1", 100);
        const riskyStatus = await okJson(await sourceRequestWithUser(safe, "seller-1", "getConnectStatus"));
        expect(riskyStatus).toMatchObject({
            applicationControlledRecipient: true,
            canReceiveProtectedPayments: false,
            riskStatus: "restricted",
        });

        const legacy = await createHarness();
        legacy.rest.seedActiveLegacyAccount("user-123");
        const legacyStatus = await okJson(await sourceRequest(legacy, "getConnectStatus"));
        expect(legacyStatus).toMatchObject({
            stripeAccountApiVersion: "v1",
            applicationControlledRecipient: false,
            payoutsEnabled: true,
            canReceiveProtectedPayments: false,
        });
    });
}
