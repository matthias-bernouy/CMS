export type JsonRecord = Record<string, unknown>;

export type PostgrestRequestRecord = {
    method: string;
    table: string;
    searchParams: Array<[string, string]>;
};

export type DashboardTable =
    | "refunds"
    | "stripe_disputes"
    | "stripe_dispute_evidence"
    | "irreversible_dispute_action_approvals"
    | "financial_operations"
    | "provider_exceptions";

export type DashboardReadHarness = {
    rest: {
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: unknown[];
        seedDashboardPayment(clientReferenceId: string, patch?: JsonRecord): number;
        seedDashboardRow(table: DashboardTable, row: JsonRecord): JsonRecord;
        patchDashboardRow(table: DashboardTable, id: number, patch: JsonRecord): void;
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
    };
    request(
        userId: string,
        role: string | undefined,
        endpoint: string,
        params?: Record<string, string>,
    ): Promise<Response>;
};

export type CreateDashboardReadHarness = () => Promise<DashboardReadHarness>;

export const olderAt = "2026-07-06T12:07:00.000Z";
export const newerAt = "2026-07-06T12:09:00.000Z";
export const refreshedAt = "2026-07-06T12:10:00.000Z";

export async function responseBody(response: Response): Promise<JsonRecord> {
    return await response.json() as JsonRecord;
}

export function clearProviderRequests(harness: DashboardReadHarness): void {
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
}

export function postgrestTables(harness: DashboardReadHarness): string[] {
    return harness.rest.postgrestRequests.map(request => request.table);
}

export function postgrestQuery(
    harness: DashboardReadHarness,
    index: number,
): Record<string, string> {
    return Object.fromEntries(harness.rest.postgrestRequests[index]?.searchParams ?? []);
}
