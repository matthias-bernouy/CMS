import type { PostgrestRequestRecord } from "../dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

export type ProviderBoundaryHarness = {
    rest: {
        readonly accountCreationRequests: Array<{ body: JsonRecord; idempotencyKey: string | null }>;
        readonly accountUpdateRequests: Array<{
            accountId: string;
            body: JsonRecord;
            idempotencyKey: string | null;
        }>;
        readonly fileUploadRequests: Array<{
            purpose: string;
            fileName: string;
            mimeType: string;
            content: number[];
        }>;
        readonly externalRequestOrder: string[];
        readonly paymentIntentCreateCount: number;
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: StripeRequestRecord[];
        clearExternalRequestOrder(): void;
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        pauseNextPlatformBalanceSettingsRead(): { entered: Promise<void>; resume: () => void };
        removePlatformPayoutControl(): void;
        rows(table: string): JsonRecord[];
        seedDispute(disputeId: string, status: string, evidenceStatus: string, submitted: boolean): void;
        setPlatformPayoutControl(patch: JsonRecord): void;
        setPlatformPayoutMinimum(minimumBalanceEur: number): void;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
    };
    request(
        userId: string,
        role: string | undefined,
        endpoint: string,
        params?: Record<string, string>,
    ): Promise<Response>;
    submit(userId: string, role: string | undefined, endpoint: string, body: unknown): Promise<Response>;
};

export type CreateProviderBoundaryHarness = () => Promise<ProviderBoundaryHarness>;

export const financialTermsHash = "a".repeat(64);
export const marketplaceTermsHash = "c".repeat(64);
export const marketplaceTermsVersion = "courtside-seller-2026-07";

export async function responseBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export function clearRequests(harness: ProviderBoundaryHarness): void {
    harness.rest.clearExternalRequestOrder();
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
}

export function postgrestBudget(harness: ProviderBoundaryHarness): Array<{ method: string; table: string }> {
    return harness.rest.postgrestRequests.map(({ method, table }) => ({ method, table }));
}

export function postgrestBody(harness: ProviderBoundaryHarness, index: number): JsonRecord {
    return harness.rest.postgrestRequests[index]?.body ?? {};
}

export function protectedPaymentBody(patch: JsonRecord = {}): JsonRecord {
    return {
        sellerUserId: "seller-1",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        currency: "eur",
        clientReferenceId: "provider-order-1",
        financialTermsHash,
        dualApprovalThresholdAmount: 1000,
        ...patch,
    };
}

export async function enrollSeller(harness: ProviderBoundaryHarness): Promise<Response> {
    return await harness.submit("seller-1", "admin", "enrollConnectSeller", {
        accountToken: "accttok_test_identity_123",
        marketplaceTermsAccepted: true,
        marketplaceTermsVersion,
        marketplaceTermsHash,
    });
}

export function accountSyncRequest(): StripeRequestRecord {
    return {
        method: "GET",
        pathname: "/v2/core/accounts/acct_custom_identity_123",
        searchParams: [
            ["include[0]", "configuration.recipient"],
            ["include[1]", "defaults"],
            ["include[2]", "identity"],
            ["include[3]", "requirements"],
        ],
        idempotencyKey: null,
        stripeAccount: null,
    };
}

export function balanceSettingsRequest(): StripeRequestRecord {
    return stripeGetRequest("/v1/balance_settings", []);
}

export function paymentIntentRequest(paymentIntentId: string): StripeRequestRecord {
    return stripeGetRequest(`/v1/payment_intents/${paymentIntentId}`, [
        ["expand[]", "latest_charge.balance_transaction"],
    ]);
}

export function expectedProtectedPayment(actual: JsonRecord, patch: JsonRecord = {}): JsonRecord {
    return {
        paymentId: 1,
        providerPaymentId: 1,
        clientReferenceId: "provider-order-1",
        financialTermsHash,
        financialRevision: 1,
        dualApprovalThresholdAmount: 1000,
        buyerUserId: "buyer-1",
        sellerUserId: "seller-1",
        stripePaymentIntentId: "pi_1",
        stripeChargeId: null,
        providerEventId: null,
        transferGroup: "cms_order_5a66e34d5f14d1ea34206f0ee2e0c236b961ff46e95cbb568d051704dae96881",
        currency: "eur",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        platformRetainedAmount: 120,
        refundedAmount: 0,
        transferredAmount: 0,
        reversedAmount: 0,
        stripeChargeBalanceTransactionId: null,
        actualStripeChargeFeeAmount: 0,
        actualStripeRefundFeeAmount: 0,
        actualStripeProcessingFeeAmount: 0,
        actualStripeChargeNetAmount: null,
        actualStripeFeeCurrency: null,
        actualStripeChargeFeeDetails: [],
        actualPlatformMarginAfterStripeAmount: 120,
        paymentStatus: "created",
        commercePaymentStatus: "created",
        settlementStatus: "held",
        disputeStatus: "none",
        manualReviewReason: null,
        paidAt: null,
        cancelledAt: null,
        lastProviderSyncAt: actual.lastProviderSyncAt,
        occurredAt: "2026-07-06T12:10:00.000Z",
        createdAt: "2026-07-06T12:05:00.000Z",
        updatedAt: "2026-07-06T12:10:00.000Z",
        clientSecret: "pi_1_secret",
        ...patch,
    };
}

function stripeGetRequest(pathname: string, searchParams: Array<[string, string]>): StripeRequestRecord {
    return { method: "GET", pathname, searchParams, idempotencyKey: null, stripeAccount: null };
}
