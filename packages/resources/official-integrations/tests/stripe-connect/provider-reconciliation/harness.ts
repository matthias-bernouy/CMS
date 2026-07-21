import type { PostgrestRequestRecord } from "../dashboard-contract-harness";

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

export type ProviderReconciliationHarness = {
    rest: {
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: unknown[];
        seedTerminalReconciliationPage(runKey: string): TerminalReconciliationSeed;
        removeTerminalReconciliationDispute(disputeRowId: number): void;
        seedPaymentProjection(paymentId: number, key: string): void;
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
    };
    run(runKey: string, limit?: number): Promise<Response>;
};

export type CreateProviderReconciliationHarness = () => Promise<ProviderReconciliationHarness>;

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

export function postgrestCalls(
    harness: ProviderReconciliationHarness,
): Array<[string, string]> {
    return harness.rest.postgrestRequests.map(request => [request.method, request.table]);
}
