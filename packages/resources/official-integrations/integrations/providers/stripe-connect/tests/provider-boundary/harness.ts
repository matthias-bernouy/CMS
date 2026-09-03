import type { PostgrestRequestRecord } from "../integration-contracts/dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

export type ProtectedRefundSearchScenario = "no-match" | "ambiguous" | "has-more" | "has-more-match";

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
        readonly refundCreateRequests: Array<{
            parameters: Array<[string, string]>;
            idempotencyKey: string | null;
        }>;
        readonly externalRequestOrder: string[];
        readonly moneyCallOrder: string[];
        readonly balanceSettingsUpdateCount: number;
        readonly paymentIntentCreateCount: number;
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: StripeRequestRecord[];
        clearExternalRequestOrder(): void;
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        addProviderDispute(chargeId: string, patch?: JsonRecord): void;
        failNextFinancialOperationFailureUpdate(): void;
        failNextDisputeFileUploadOnce(): void;
        failNextPaymentIntentCreationOnce(): void;
        failNextPaymentProjectionEnqueue(): void;
        failNextProtectedPaymentReservation(mode: "missing" | "raced"): void;
        failNextPostgrestWrite(table: string, method: "POST" | "PATCH"): void;
        linkNextProtectedPaymentReservationToIntent(): void;
        loseNextPlatformPayoutProtectionResponse(): void;
        loseNextRefundCreationResponse(): void;
        omitNextPaymentRead(): void;
        patchPaymentLedger(paymentId: number, patch: JsonRecord): void;
        patchRefundLedger(refundId: number, patch: JsonRecord): void;
        removePayment(paymentId: number): void;
        pauseNextPlatformBalanceSettingsRead(): { entered: Promise<void>; resume: () => void };
        pauseNextPostgrestRead(
            table: "payments" | "refunds" | "transfer_reversals",
            readsToSkip?: number,
        ): { entered: Promise<void>; resume: () => void };
        pauseNextRefundReload(): { entered: Promise<void>; resume: () => void };
        quarantineNextPaymentIntentProjection(): void;
        removePlatformPayoutControl(): void;
        rows(table: string): JsonRecord[];
        seedDispute(disputeId: string, status: string, evidenceStatus: string, submitted: boolean): void;
        setPlatformPayoutControl(patch: JsonRecord): void;
        setPlatformPayoutMinimum(minimumBalanceEur: number): void;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
        setNextRefundSearchScenario(scenario: ProtectedRefundSearchScenario): void;
        setNextRefundStatus(status: "succeeded" | "pending" | "failed"): void;
        seedSettlementLedgerRow(table: "refunds" | "transfer_reversals", row: JsonRecord): JsonRecord;
        succeedNextPaymentIntentOperation(): void;
        succeedNextRefundOperation(): void;
    };
    apiKey: string;
    edgeRequest(request: Request): Promise<Response>;
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

function stripeGetRequest(pathname: string, searchParams: Array<[string, string]>): StripeRequestRecord {
    return { method: "GET", pathname, searchParams, idempotencyKey: null, stripeAccount: null };
}
