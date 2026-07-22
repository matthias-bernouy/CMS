import type { PostgrestRequestRecord } from "../../dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type RepositoryBoundaryHarness = {
    rest: {
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: unknown[];
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        rows(table: string): JsonRecord[];
        setAccountState(userId: string, patch: JsonRecord): void;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
    };
    submit(userId: string, role: string | undefined, endpoint: string, body: unknown): Promise<Response>;
};

export type CreateRepositoryBoundaryHarness = () => Promise<RepositoryBoundaryHarness>;

export const financialTermsHash = "a".repeat(64);
export const marketplaceTermsHash = "c".repeat(64);
export const marketplaceTermsVersion = "courtside-seller-2026-07";

export async function responseBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export function clearRequests(harness: RepositoryBoundaryHarness): void {
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
}

export function postgrestBudget(harness: RepositoryBoundaryHarness): Array<{ method: string; table: string }> {
    return harness.rest.postgrestRequests.map(({ method, table }) => ({ method, table }));
}

export function postgrestQuery(harness: RepositoryBoundaryHarness, index: number): Record<string, string> {
    return Object.fromEntries(harness.rest.postgrestRequests[index]?.searchParams ?? []);
}

export function postgrestBody(harness: RepositoryBoundaryHarness, index: number): JsonRecord {
    return harness.rest.postgrestRequests[index]?.body ?? {};
}

export async function enrollSeller(harness: RepositoryBoundaryHarness): Promise<Response> {
    return await harness.submit("seller-1", "admin", "enrollConnectSeller", {
        accountToken: "accttok_test_identity_123",
        marketplaceTermsAccepted: true,
        marketplaceTermsVersion,
        marketplaceTermsHash,
    });
}

export async function createProtectedPayment(harness: RepositoryBoundaryHarness): Promise<Response> {
    return await harness.submit("buyer-1", "admin", "createProtectedPayment", {
        sellerUserId: "seller-1",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        currency: "eur",
        clientReferenceId: "repository-order-1",
        financialTermsHash,
        dualApprovalThresholdAmount: 1000,
    });
}
