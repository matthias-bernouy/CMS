import type { PostgrestRequestRecord } from "../../../dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

export type NonterminalSettlementSeed = {
    operationId: number;
    transferId: number;
};

export type SettlementReleaseHarness = {
    rest: {
        readonly externalRequestOrder: string[];
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: StripeRequestRecord[];
        readonly lastTransferParameters: Record<string, string> | null;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
        failNextTransferCreationOnce(): void;
        loseNextTransferResponseOnce(): void;
        omitProviderTransfersOnNextList(): void;
        removeAccount(userId: string): void;
        patchPaymentLedger(paymentId: number, patch: JsonRecord): void;
        addProviderTransfer(transferGroup: string, patch?: JsonRecord): string;
        seedNonterminalSettlementRelease(paymentId: number, releaseAuthorizationId: string): NonterminalSettlementSeed;
        rows(table: string): JsonRecord[];
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        clearExternalRequestOrder(): void;
    };
    run(runKey: string, limit?: number): Promise<Response>;
    submit(userId: string, endpoint: string, body: unknown, params?: Record<string, string>): Promise<Response>;
};

export type CreateSettlementReleaseHarness = () => Promise<SettlementReleaseHarness>;

export type SettlementReleaseFixture = SettlementReleaseHarness & {
    accountId: string;
    chargeId: string;
    clientReferenceId: string;
    paymentId: number;
    paymentIntentId: string;
    releaseAuthorizationId: string;
    sellerUserId: string;
    transferGroup: string;
    release(overrides?: JsonRecord): Promise<Response>;
    resetRequests(): void;
};

const financialTermsHash = "a".repeat(64);

export async function createSettlementReleaseFixture(
    createHarness: CreateSettlementReleaseHarness,
    clientReferenceId: string,
): Promise<SettlementReleaseFixture> {
    const harness = await createHarness();
    const sellerUserId = `seller-${clientReferenceId}`;
    await successfulJson(
        await harness.submit(
            sellerUserId,
            "createConnectOnboardingSessionForUser",
            { email: `${sellerUserId}@example.test` },
            { userId: sellerUserId },
        ),
    );
    const created = await successfulJson(
        await harness.submit("settlement-buyer", "createProtectedPayment", {
            sellerUserId,
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId,
            financialTermsHash,
            financialRevision: 1,
            dualApprovalThresholdAmount: 1000,
            description: "Settlement release order",
        }),
    );
    const paymentId = Number(created.paymentId);
    const paymentIntentId = String(created.stripePaymentIntentId);
    harness.rest.setPaymentIntentSucceeded(paymentIntentId);
    await successfulJson(
        await harness.submit("settlement-system", "reconcileProviderPayment", {
            paymentId,
        }),
    );
    const payment = harness.rest.rows("payments").find((row) => row.id === paymentId);
    if (!payment?.stripe_charge_id || !payment.seller_stripe_account_id) {
        throw new Error("invalid settlement release fixture");
    }
    const releaseAuthorizationId = `${clientReferenceId}-release`;
    return {
        ...harness,
        accountId: String(payment.seller_stripe_account_id),
        chargeId: String(payment.stripe_charge_id),
        clientReferenceId,
        paymentId,
        paymentIntentId,
        releaseAuthorizationId,
        sellerUserId,
        transferGroup: String(payment.transfer_group),
        release: async (overrides = {}) =>
            await harness.submit("settlement-system", "requestSettlementRelease", {
                paymentId,
                releaseAuthorizationId,
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
                ...overrides,
            }),
        resetRequests() {
            harness.rest.clearPostgrestRequests();
            harness.rest.clearStripeRequests();
            harness.rest.clearExternalRequestOrder();
        },
    };
}

export async function responseJson(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export async function successfulJson(response: Response): Promise<JsonRecord> {
    const body = await responseJson(response);
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`expected success, received ${response.status}: ${JSON.stringify(body)}`);
    }
    return body;
}

export function postgrestCalls(harness: SettlementReleaseHarness): Array<[string, string]> {
    return harness.rest.postgrestRequests.map(({ method, table }) => [method, table]);
}

export async function transferIdempotencyKey(paymentId: number, releaseAuthorizationId: string): Promise<string> {
    const businessKey = `settlement:${paymentId}:${releaseAuthorizationId}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(businessKey));
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `cms:transfer:${hex}`;
}
