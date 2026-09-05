import type { PostgrestRequestRecord } from "../integration-contracts/dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

export type RoutingHarness = {
    apiKey: string;
    rest: {
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: StripeRequestRecord[];
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        addProviderRefund(chargeId: string, patch?: JsonRecord): void;
        failNextPostgrestWrite(table: string, method: "POST" | "PATCH"): void;
        patchProviderTransfer(stripeTransferId: string, patch: JsonRecord): void;
        rows(table: string): JsonRecord[];
        setCurrentMarketplaceTermsConfiguration(configuration: JsonRecord | null): void;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
        setStripeAccountState(userId: string, patch: JsonRecord): void;
    };
    edgeRequest(request: Request): Promise<Response>;
    providerRequestCount(): number;
    request(
        userId: string,
        role: string | undefined,
        endpoint: string,
        params?: Record<string, string>,
    ): Promise<Response>;
    submit(userId: string, role: string | undefined, endpoint: string, body: unknown): Promise<Response>;
};

export type CreateRoutingHarness = () => Promise<RoutingHarness>;

export const functionsBaseUrl = "https://project.supabase.co/functions/v1";
export const financialTermsHash = "a".repeat(64);
export const marketplaceTermsHash = "c".repeat(64);
export const marketplaceTermsVersion = "marketplace-seller-2026-07";

export function cmsHeaders(harness: RoutingHarness, userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${harness.apiKey}`,
        "content-type": "application/json",
        "x-cms-user-id": userId,
    };
}

export function clearRequests(harness: RoutingHarness): void {
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
}

export function postgrestBudget(harness: RoutingHarness): Array<{ method: string; table: string }> {
    return harness.rest.postgrestRequests.map(({ method, table }) => ({ method, table }));
}

export async function responseBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export async function stripeSignature(payload: string, secret: string, timestamp = currentUnixTime()): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
    const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `t=${timestamp},v1=${hex}`;
}

export function currentUnixTime(): number {
    return Math.floor(Date.now() / 1000);
}

export async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function protectedPaymentBody(patch: JsonRecord = {}): JsonRecord {
    return {
        sellerUserId: "seller-1",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        currency: "eur",
        clientReferenceId: "routing-order-1",
        financialTermsHash,
        dualApprovalThresholdAmount: 1000,
        ...patch,
    };
}

export async function enrollSeller(harness: RoutingHarness): Promise<Response> {
    return await harness.submit("seller-1", "admin", "enrollConnectSeller", {
        accountToken: "accttok_test_identity_123",
        marketplaceTermsAccepted: true,
        marketplaceTermsVersion,
        marketplaceTermsHash,
    });
}

export async function createProtectedPayment(harness: RoutingHarness): Promise<Response> {
    return await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
}
