import type { PostgrestRequestRecord } from "../../integration-contracts/dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

export type PaymentCancellationHarness = {
    rest: {
        readonly externalRequestOrder: string[];
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: StripeRequestRecord[];
        readonly paymentIntentCreateCount: number;
        failNextPaymentCancellationOperationReservation(): void;
        seedDashboardPayment(clientReferenceId: string, patch?: JsonRecord): number;
        patchPaymentLedger(paymentId: number, patch: JsonRecord): void;
        patchDashboardRow(table: "financial_operations", id: number, patch: JsonRecord): void;
        keepNextPaymentCancellationNonTerminal(): void;
        pauseNextPostgrestRead(table: "payments", readsToSkip?: number): { entered: Promise<void>; resume: () => void };
        rows(table: string): JsonRecord[];
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        clearExternalRequestOrder(): void;
    };
    submit(userId: string, endpoint: string, body: unknown, params?: Record<string, string>): Promise<Response>;
};

export type CreatePaymentCancellationHarness = () => Promise<PaymentCancellationHarness>;

export type PaymentCancellationFixture = PaymentCancellationHarness & {
    buyerUserId: string;
    cancellationRequestId: string;
    clientReferenceId: string;
    creationOperationId: number;
    paymentId: number;
    paymentIntentId: string;
    transferGroup: string;
    cancel(reason?: string): Promise<Response>;
    resetRequests(): void;
};

export const financialTermsHash = "a".repeat(64);

export async function createPaymentCancellationFixture(
    createHarness: CreatePaymentCancellationHarness,
    clientReferenceId: string,
): Promise<PaymentCancellationFixture> {
    const harness = await createHarness();
    const buyerUserId = `buyer-${clientReferenceId}`;
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
        await harness.submit(buyerUserId, "createProtectedPayment", {
            sellerUserId,
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId,
            financialTermsHash,
            financialRevision: 1,
            dualApprovalThresholdAmount: 1000,
            description: "Cancellation order",
        }),
    );
    const paymentId = Number(created.paymentId);
    const paymentIntentId = String(created.stripePaymentIntentId);
    const creationOperation = harness.rest
        .rows("financial_operations")
        .find((row) => row.business_key === `payment:${paymentId}:${financialTermsHash}`);
    const creationOperationId = Number(creationOperation?.id);
    if (!Number.isSafeInteger(paymentId) || !paymentIntentId.startsWith("pi_") || !creationOperationId) {
        throw new Error("invalid payment cancellation fixture");
    }
    const cancellationRequestId = `cancel-${clientReferenceId}`;
    return {
        ...harness,
        buyerUserId,
        cancellationRequestId,
        clientReferenceId,
        creationOperationId,
        paymentId,
        paymentIntentId,
        transferGroup: String(created.transferGroup),
        cancel: async (reason = "buyer cancelled") =>
            await harness.submit(buyerUserId, "cancelProtectedPayment", {
                clientReferenceId,
                cancellationRequestId,
                reason,
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

export function postgrestBudget(fixture: PaymentCancellationFixture): Array<[string, string]> {
    return fixture.rest.postgrestRequests.map(({ method, table }) => [method, table]);
}

export async function cancellationIdempotencyKey(paymentIntentId: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(paymentIntentId));
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `cms:payment-cancel:${hex}`;
}
