import { expect, test } from "bun:test";
import { financialTermsHash, marketplaceTermsHash } from "../../runtime/constants";
import { jsonBody, okJson } from "../../runtime/http";
import { sourceJson, sourceJsonWithUser, sourceRequest, sourceRequestWithUser } from "../../runtime/source-requests";
import type { CreateAccountSourceScenarioHarness } from "./harness";

export function registerHeldPaymentSourceScenario(createHarness: CreateAccountSourceScenarioHarness): void {
    test("accepts a held charge before Stripe transfers or bank payouts are ready but keeps release strict", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJsonWithUser(harness, "seller-1", "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: "marketplace-seller-2026-07",
                marketplaceTermsHash,
            }),
        );
        harness.rest.setStripeAccountState("seller-1", {
            configuration: {
                recipient: {
                    applied: true,
                    capabilities: {
                        stripe_balance: {
                            stripe_transfers: { status: "pending", status_details: [] },
                            payouts: { status: "unrequested", status_details: [] },
                        },
                    },
                },
            },
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

        const status = await okJson(
            await sourceRequestWithUser(harness, "seller-1", "getConnectStatus", {
                marketplaceTermsVersion: "marketplace-seller-2026-07",
                marketplaceTermsHash,
            }),
        );
        expect(status).toMatchObject({
            stripeTransfersStatus: "pending",
            bankAccountStatus: "not_attached",
            canAcceptHeldPayments: true,
            canReceiveProtectedPayments: false,
        });

        const payment = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "minimal-enrollment-held-charge",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        expect(payment).toMatchObject({ settlementStatus: "held", sellerUserId: "seller-1" });

        harness.rest.setPaymentIntentSucceeded(String(payment.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(payment.paymentId) }));
        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: payment.paymentId,
            releaseAuthorizationId: "release-before-kyc",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({ error: "seller financial risk blocks settlement release" });
    });
}
