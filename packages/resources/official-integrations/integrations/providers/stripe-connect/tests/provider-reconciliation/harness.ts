import type { PostgrestRequestRecord } from "../integration-contracts/dashboard/dashboard-contract-harness";

export type JsonRecord = Record<string, unknown>;

export type TerminalReconciliationSeed = {
    runId: number;
    runKey: string;
    paymentId: number;
    operationId: number;
    disputeRowId: number;
    paymentProjectionId: number;
    operationProjectionId: number;
    disputeProjectionId: number;
    paymentProjectionKey: string;
    operationProjectionKey: string;
    disputeProjectionKey: string;
};

export type OperationRecoveryKind = "transfer" | "reversal" | "refund";

export type TerminalOperationRecoverySeed = {
    kind: OperationRecoveryKind;
    paymentId: number;
    operationId: number;
    artifactId: number;
    providerObjectId: string;
};

export type ProviderReconciliationHarness = {
    rest: {
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: Array<{ method: string; pathname: string }>;
        seedTerminalOperationRecovery(kind: OperationRecoveryKind): TerminalOperationRecoverySeed;
        seedTerminalReconciliationPage(runKey: string): TerminalReconciliationSeed;
        removeTerminalReconciliationDispute(disputeRowId: number): void;
        seedPaymentProjection(paymentId: number, key: string): void;
        seedProviderException(
            deduplicationKey: string,
            status: "open" | "investigating" | "resolved",
            patch?: JsonRecord,
        ): number;
        failNextProviderExceptionResolution(): void;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
        setNextRefundStatus(status: "succeeded" | "pending" | "failed"): void;
        failNextPaymentIntentRetrieve(): void;
        patchProviderTransfer(stripeTransferId: string, patch: JsonRecord): void;
        addProviderTransfer(transferGroup: string, patch?: JsonRecord): string;
        seedLocalTransferReversal(stripeTransferId: string, amount: number, status: string): void;
        failProviderTransferContextReadAfter(successfulReads: number): void;
        failNextProviderDisputeList(): void;
        failNextProviderRefundList(): void;
        failNextProviderTransferList(): void;
        seedPaymentReconciliationLedger(paymentId: number): void;
        setPaymentReconciliationSellerRecoveryAmount(paymentId: number, amount: number): void;
        failNextPaymentReconciliationLedgerRead(): void;
        failNextPaymentReconciliationLocalContextRead(): void;
        rows(table: string): JsonRecord[];
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
    };
    run(runKey: string, limit?: number): Promise<Response>;
    submit(userId: string, endpoint: string, body: unknown, params?: Record<string, string>): Promise<Response>;
};

export type CreateProviderReconciliationHarness = () => Promise<ProviderReconciliationHarness>;

export const paymentLedgerFinancialTermsHash = "a".repeat(64);

export type TrackedProviderTransferFixture = ProviderReconciliationHarness & {
    paymentId: number;
    paymentIntentId: string;
    stripeTransferIds: string[];
};

export async function createTrackedProviderTransferFixture(
    createHarness: CreateProviderReconciliationHarness,
    reference: string,
    releases: Array<{ id: string; amount: number }> = [{ id: "initial", amount: 1080 }],
): Promise<TrackedProviderTransferFixture> {
    const harness = await createHarness();
    await successfulJson(
        await harness.submit(
            "user-123",
            "createConnectOnboardingSessionForUser",
            {
                email: "seller-transfer-context@example.com",
            },
            { userId: "seller-transfer-context" },
        ),
    );
    const created = await successfulJson(
        await harness.submit("user-123", "createProtectedPayment", {
            sellerUserId: "seller-transfer-context",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: reference,
            financialTermsHash: paymentLedgerFinancialTermsHash,
            dualApprovalThresholdAmount: 1000,
        }),
    );
    const paymentId = Number(created.paymentId);
    const paymentIntentId = String(created.stripePaymentIntentId);
    harness.rest.setPaymentIntentSucceeded(paymentIntentId);
    for (const [index, release] of releases.entries()) {
        await successfulJson(
            await harness.submit("system-transfer-context", "requestSettlementRelease", {
                paymentId,
                releaseAuthorizationId: `${reference}-${release.id}`,
                releaseKind: index === 0 ? "initial" : "reserve",
                amount: release.amount,
                currency: "eur",
            }),
        );
    }
    const stripeTransferIds = harness.rest.rows("transfers").map((row) => String(row.stripe_transfer_id));
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
    return { ...harness, paymentId, paymentIntentId, stripeTransferIds };
}

export async function createPaymentLedgerFixture(
    createHarness: CreateProviderReconciliationHarness,
    reference: string,
): Promise<ProviderReconciliationHarness & { paymentId: number; paymentIntentId: string }> {
    const harness = await createHarness();
    await successfulJson(
        await harness.submit(
            "user-123",
            "createConnectOnboardingSessionForUser",
            {
                email: "seller-ledger@example.com",
            },
            { userId: "seller-ledger" },
        ),
    );
    const created = await successfulJson(
        await harness.submit("user-123", "createProtectedPayment", {
            sellerUserId: "seller-ledger",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: reference,
            financialTermsHash: paymentLedgerFinancialTermsHash,
            dualApprovalThresholdAmount: 1000,
        }),
    );
    const paymentId = Number(created.paymentId);
    const paymentIntentId = String(created.stripePaymentIntentId);
    harness.rest.setPaymentIntentSucceeded(paymentIntentId);
    harness.rest.seedPaymentReconciliationLedger(paymentId);
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
    return { ...harness, paymentId, paymentIntentId };
}

export async function createTerminalPageFixture(
    createHarness: CreateProviderReconciliationHarness,
    runKey: string,
): Promise<ProviderReconciliationHarness & { seed: TerminalReconciliationSeed }> {
    const harness = await createHarness();
    const seed = harness.rest.seedTerminalReconciliationPage(runKey);
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
    return { ...harness, seed };
}

export async function successfulJson(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    const body = JSON.parse(text) as JsonRecord;
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`expected success, received ${response.status}: ${text}`);
    }
    return body;
}

export function postgrestCalls(harness: ProviderReconciliationHarness): Array<[string, string]> {
    return harness.rest.postgrestRequests.map((request) => [request.method, request.table]);
}
