import type { PostgrestRequestRecord } from "../../dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

export type PaymentProjectionHarness = {
    rest: {
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: StripeRequestRecord[];
        setPaymentIntentSucceeded(paymentIntentId: string): void;
        patchPaymentIntent(paymentIntentId: string, patch: JsonRecord): void;
        replacePaymentIntentDuringNextRetrieve(paymentId: number, replacementId: string): void;
        failNextPaymentProjectionEnqueue(): void;
        loseNextPaymentProjectionEnqueueResponse(): void;
        failNextPaymentIntentRetrieve(): void;
        rows(table: string): JsonRecord[];
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
    };
    request(userId: string, endpoint: string, params?: Record<string, string>): Promise<Response>;
    submit(userId: string, endpoint: string, body: unknown, params?: Record<string, string>): Promise<Response>;
};

export type CreatePaymentProjectionHarness = () => Promise<PaymentProjectionHarness>;

export const buyerUserId = "projection-buyer";
export const sellerUserId = "projection-seller";
export const financialTermsHash = "a".repeat(64);

export type PaymentProjectionFixture = PaymentProjectionHarness & {
    clientReferenceId: string;
    paymentId: number;
    paymentIntentId: string;
    read(): Promise<Response>;
    resetRequests(): void;
};

export async function createPaymentProjectionFixture(
    createHarness: CreatePaymentProjectionHarness,
    clientReferenceId: string,
): Promise<PaymentProjectionFixture> {
    const harness = await createHarness();
    await successfulJson(
        await harness.submit(
            sellerUserId,
            "createConnectOnboardingSessionForUser",
            { email: "projection-seller@example.test" },
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
            description: "Projection order",
        }),
    );
    const paymentId = Number(created.paymentId);
    const paymentIntentId = String(created.stripePaymentIntentId);
    if (!Number.isSafeInteger(paymentId) || !paymentIntentId.startsWith("pi_")) {
        throw new Error("invalid protected payment fixture");
    }
    return {
        ...harness,
        clientReferenceId,
        paymentId,
        paymentIntentId,
        read: async () => await harness.request(buyerUserId, "getProtectedPayment", { paymentId: String(paymentId) }),
        resetRequests() {
            harness.rest.clearPostgrestRequests();
            harness.rest.clearStripeRequests();
        },
    };
}

export async function successfulJson(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    let body: JsonRecord;
    try {
        body = JSON.parse(text) as JsonRecord;
    } catch {
        throw new Error(`expected JSON, received ${response.status}: ${text}`);
    }
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`expected success, received ${response.status}: ${JSON.stringify(body)}`);
    }
    return body;
}

export function postgrestCalls(fixture: PaymentProjectionFixture): Array<[string, string]> {
    return fixture.rest.postgrestRequests.map((request) => [request.method, request.table]);
}

export async function transferGroup(clientReferenceId: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientReferenceId));
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `cms_order_${hex}`;
}
