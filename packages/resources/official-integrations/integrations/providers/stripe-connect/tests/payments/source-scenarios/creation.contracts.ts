import { expect, test } from "bun:test";
import { USER_ROLE } from "@bernouy/cms-permissions";
import { financialTermsHash } from "../../runtime/constants";
import type { StripeConnectHarness } from "../../runtime/harness";
import { jsonBody, okJson } from "../../runtime/http";
import { sourceJson, sourceRequest, sourceRequestWithUser } from "../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerProtectedPaymentCreationScenario(createHarness: CreateHarness): void {
    test("creates a protected platform payment and strictly replays immutable terms", async () => {
        const harness = await createHarness();

        const config = await okJson(await sourceRequest(harness, "getConnectClientConfig"));
        const initial = await okJson(await sourceRequest(harness, "getConnectStatus"));
        const sellerSession = await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                    country: "FR",
                },
                { userId: "seller-1" },
            ),
        );
        const payment = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: "1200",
                sellerTransferAmount: "1080",
                currency: "EUR",
                clientReferenceId: "order-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
                description: "Order 1",
            }),
        );
        const repeated = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: "1200",
                sellerTransferAmount: "1080",
                currency: "EUR",
                clientReferenceId: "order-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
                description: "Order 1",
            }),
        );
        const mismatch = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1201,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "order-1",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });
        const listedPayments = await okJson(
            await sourceRequest(harness, "listProviderPayments", { q: "order", limit: "20" }),
        );
        const fetched = await okJson(
            await sourceRequest(harness, "getProtectedPayment", { paymentId: String(payment.paymentId) }),
        );
        const fetchedByReference = await okJson(
            await sourceRequest(harness, "getProtectedPaymentByClientReference", { clientReferenceId: "order-1" }),
        );
        const missingByReference = await okJson(
            await sourceRequest(harness, "getProtectedPaymentByClientReference", {
                clientReferenceId: "order-missing",
            }),
        );
        const hiddenByReference = await okJson(
            await sourceRequestWithUser(harness, "another-buyer", "getProtectedPaymentByClientReference", {
                clientReferenceId: "order-1",
            }),
        );
        const dashboard = await harness.dashboardViews.getView("stripe-connect-marketplace-terms");
        const userRole = await harness.roles.get(USER_ROLE);

        expect(config).toEqual({ publishableKey: "pk_test_123" });
        expect(initial).toMatchObject({
            exists: false,
            userId: "user-123",
            connected: false,
            onboardingStatus: "not_started",
        });
        expect(sellerSession).toMatchObject({
            exists: true,
            userId: "seller-1",
            connected: true,
            onboardingStatus: "onboarding_started",
            chargesEnabled: false,
            payoutsEnabled: true,
            clientSecret: "as_seller-1_secret",
        });
        expect(payment).toMatchObject({
            clientReferenceId: "order-1",
            buyerUserId: "user-123",
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            platformRetainedAmount: 120,
            paymentStatus: "created",
            settlementStatus: "held",
            financialTermsHash,
            stripePaymentIntentId: "pi_1",
            clientSecret: "pi_1_secret",
        });
        expect(repeated.paymentId).toBe(payment.paymentId);
        expect(harness.rest.paymentIntentCreateCount).toBe(1);
        expect(mismatch.status).toBe(409);
        expect(await jsonBody(mismatch)).toEqual({
            error: "protected payment replay does not match immutable financial terms",
        });
        expect(listedPayments.payments).toEqual([
            expect.objectContaining({ clientReferenceId: "order-1", stripePaymentIntentId: "pi_1" }),
        ]);
        expect(fetched).toMatchObject({
            paymentId: payment.paymentId,
            clientReferenceId: "order-1",
            reconciliationPending: false,
        });
        expect(fetchedByReference).toMatchObject({
            exists: true,
            payment: {
                paymentId: payment.paymentId,
                clientReferenceId: "order-1",
                commercePaymentStatus: "created",
                reconciliationPending: false,
            },
        });
        expect(missingByReference).toEqual({ exists: false });
        expect(hiddenByReference).toEqual({ exists: false });
        expect(harness.rest.rows("payments")).toHaveLength(1);
        expect(dashboard).toBeTruthy();
        expect(dashboard?.source).toBe("stripe-connect");
        const userPermissions = userRole?.grants.map((grant) => grant.permission) ?? [];
        expect(userPermissions).toEqual(
            expect.arrayContaining([
                "urn:stripe-connect:getConnectClientConfig",
                "urn:stripe-connect:getConnectStatus",
                "urn:stripe-connect:getConnectWallet",
                "urn:stripe-connect:enrollConnectSeller",
                "urn:stripe-connect:submitConnectVerification",
                "urn:stripe-connect:createOnboardingLink",
                "urn:stripe-connect:createOnboardingSession",
            ]),
        );
        expect(userPermissions).not.toContain("urn:stripe-connect:getProtectedPayment");
        expect(userPermissions).not.toContain("urn:stripe-connect:getProtectedPaymentByClientReference");
        expect(harness.importedBlocs).toEqual([]);
        expect(harness.rest.lastPaymentIntentParameters?.has("transfer_data[destination]")).toBeFalse();
        expect(harness.rest.lastPaymentIntentParameters?.has("application_fee_amount")).toBeFalse();
        expect(harness.rest.lastPaymentIntentParameters?.has("on_behalf_of")).toBeFalse();
    });
}
