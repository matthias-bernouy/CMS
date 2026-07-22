import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateProviderBoundaryHarness, postgrestBudget, responseBody } from "./harness";

const accountId = "acct_custom_identity_123";
const updatedToken = "accttok_test_identity_456";
const accountIncludes = [
    ["include[0]", "configuration.recipient"],
    ["include[1]", "defaults"],
    ["include[2]", "identity"],
    ["include[3]", "requirements"],
] as Array<[string, string]>;
const updateIdempotencyKey =
    "cms_connect_custom_identity_77fab17a68c74630877dceb0d7c412c47ea09705e7b01b92c20dfc75a51d3429";

export function registerAccountProviderBoundaryContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect account provider boundary contracts", () => {
        test("updates one existing v2 account and returns the freshly retrieved provider state", async () => {
            const harness = await createHarness();
            const created = await harness.submit("user-123", "admin", "submitConnectVerification", {
                accountToken: "accttok_test_identity_123",
            });
            expect(created.status).toBe(200);

            clearRequests(harness);
            const response = await harness.submit("user-123", "admin", "submitConnectVerification", {
                accountToken: updatedToken,
            });

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual(expectedAccount());
            expect(harness.rest.accountCreationRequests).toHaveLength(0);
            expect(harness.rest.accountUpdateRequests).toEqual([
                {
                    accountId,
                    body: { account_token: updatedToken },
                    idempotencyKey: updateIdempotencyKey,
                },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                stripeAccountRequest("GET", accountIncludes, null),
                stripeAccountRequest("POST", [], updateIdempotencyKey),
                stripeAccountRequest("GET", accountIncludes, null),
            ]);
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "accounts" },
                { method: "POST", table: "accounts" },
            ]);
        });
    });
}

function stripeAccountRequest(method: string, searchParams: Array<[string, string]>, idempotencyKey: string | null) {
    return {
        method,
        pathname: `/v2/core/accounts/${accountId}`,
        searchParams,
        idempotencyKey,
        stripeAccount: null,
    };
}

function expectedAccount() {
    return {
        exists: true,
        userId: "user-123",
        stripeAccountId: accountId,
        stripeAccountApiVersion: "v2",
        connected: true,
        accountStatus: "active",
        termsStatus: "accepted",
        stripeTermsStatus: "accepted",
        marketplaceTermsStatus: "accepted",
        marketplaceTermsCurrentVersionAccepted: false,
        marketplaceTermsAcceptedAt: "2026-07-06T12:00:00.000Z",
        enrollmentStatus: "enrolled",
        country: "FR",
        businessType: "individual",
        onboardingStatus: "enabled",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: true,
        applicationControlledRecipient: true,
        stripeTransfersStatus: "active",
        bankAccountStatus: "not_attached",
        bankPayoutsStatus: "unrequested",
        canAcceptHeldPayments: true,
        canReceiveProtectedPayments: true,
        payoutBankReady: false,
        disabledReason: null,
        currentlyDue: [],
        eventuallyDue: [],
        pastDue: [],
        pendingVerification: [],
        payoutSchedule: "stripe_default",
        riskStatus: "standard",
        financialHoldReason: null,
        outstandingDebtAmount: 0,
        financialExposureAmount: 0,
        riskRevision: 0,
        providerHoldMinimumAmount: 0,
        payoutBlockedAt: null,
        manualPayoutHoldStartedAt: null,
        manualPayoutHoldAlertAt: null,
        manualPayoutHoldDeadlineAt: null,
        lastOnboardingStartedAt: null,
        lastProviderSyncAt: null,
        occurredAt: "2026-07-06T12:00:00.000Z",
        createdAt: "2026-07-06T12:00:00.000Z",
        updatedAt: "2026-07-06T12:00:00.000Z",
    };
}
