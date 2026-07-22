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
        readonly postgrestRequests: Array<{ method: string; table: string }>;
        readonly stripeRequests: StripeRequestRecord[];
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        rows(table: string): JsonRecord[];
        seedDispute(disputeId: string, status: string, evidenceStatus: string, submitted: boolean): void;
    };
    submit(userId: string, role: string | undefined, endpoint: string, body: unknown): Promise<Response>;
};

export type CreateProviderBoundaryHarness = () => Promise<ProviderBoundaryHarness>;

export async function responseBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export function clearRequests(harness: ProviderBoundaryHarness): void {
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
}

export function postgrestBudget(harness: ProviderBoundaryHarness): Array<{ method: string; table: string }> {
    return harness.rest.postgrestRequests.map(({ method, table }) => ({ method, table }));
}
