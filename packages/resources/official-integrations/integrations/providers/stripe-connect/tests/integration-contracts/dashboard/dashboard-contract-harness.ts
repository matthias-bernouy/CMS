export type JsonRecord = Record<string, unknown>;

export type PostgrestRequestRecord = {
    method: string;
    table: string;
    searchParams: Array<[string, string]>;
    body: JsonRecord | null;
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
        rows(table: string): JsonRecord[];
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
export const dashboardPaymentSelect = [
    "id",
    "client_reference_id",
    "financial_terms_hash",
    "financial_revision",
    "dual_approval_threshold_amount",
    "buyer_cms_user_id",
    "seller_cms_user_id",
    "seller_stripe_account_id",
    "stripe_payment_intent_id",
    "stripe_charge_id",
    "stripe_charge_balance_transaction_id",
    "last_stripe_event_id",
    "transfer_group",
    "currency",
    "amount_total",
    "seller_transfer_amount",
    "platform_retained_amount",
    "refunded_amount",
    "transferred_amount",
    "reversed_amount",
    "actual_stripe_charge_fee_amount",
    "actual_stripe_refund_fee_amount",
    "actual_stripe_processing_fee_amount",
    "actual_stripe_charge_net_amount",
    "actual_stripe_fee_currency",
    "actual_stripe_charge_fee_details",
    "payment_status",
    "settlement_status",
    "dispute_status",
    "description",
    "manual_review_reason",
    "paid_at",
    "cancelled_at",
    "last_provider_sync_at",
    "created_at",
    "updated_at",
].join(",");

export async function responseBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export function clearProviderRequests(harness: DashboardReadHarness): void {
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
}

export function postgrestTables(harness: DashboardReadHarness): string[] {
    return harness.rest.postgrestRequests.map((request) => request.table);
}

export function postgrestQuery(harness: DashboardReadHarness, index: number): Record<string, string> {
    return Object.fromEntries(harness.rest.postgrestRequests[index]?.searchParams ?? []);
}

export function postgrestBody(harness: DashboardReadHarness, index: number): JsonRecord {
    return harness.rest.postgrestRequests[index]?.body ?? {};
}
