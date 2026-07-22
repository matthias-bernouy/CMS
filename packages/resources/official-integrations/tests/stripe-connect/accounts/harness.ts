export type JsonRecord = Record<string, unknown>;

export type PostgrestRequestRecord = {
    method: string;
    table: string;
    searchParams: Array<[string, string]>;
    body: JsonRecord | null;
};

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};

export type AccountHandlerHarness = {
    apiKey: string;
    rest: {
        readonly accountCreationRequests: Array<{ body: JsonRecord; idempotencyKey: string | null }>;
        readonly accountLinkRequests: JsonRecord[];
        readonly externalRequestOrder: string[];
        readonly postgrestRequests: PostgrestRequestRecord[];
        readonly stripeRequests: StripeRequestRecord[];
        clearExternalRequestOrder(): void;
        clearPostgrestRequests(): void;
        clearStripeRequests(): void;
        failNextAccountReloadAfterTermsAcceptance(): void;
        rows(table: string): JsonRecord[];
        seedActiveLegacyAccount(userId: string): void;
    };
    edgeRequest(request: Request): Promise<Response>;
    submit(userId: string, role: string | undefined, endpoint: string, body: unknown): Promise<Response>;
};

export type CreateAccountHandlerHarness = () => Promise<AccountHandlerHarness>;

export const accountSelect = [
    "cms_user_id",
    "stripe_account_id",
    "stripe_account_api_version",
    "application_controlled_recipient",
    "terms_accepted",
    "provider_account_closed",
    "external_bank_account_attached",
    "marketplace_terms_version",
    "marketplace_terms_hash",
    "marketplace_terms_accepted_at",
    "country",
    "business_type",
    "onboarding_status",
    "charges_enabled",
    "payouts_enabled",
    "details_submitted",
    "disabled_reason",
    "capabilities",
    "requirements_currently_due",
    "requirements_eventually_due",
    "requirements_past_due",
    "requirements_pending_verification",
    "requirements_errors",
    "future_requirements",
    "payout_schedule",
    "risk_status",
    "financial_hold_reason",
    "outstanding_debt_amount",
    "financial_exposure_amount",
    "risk_revision",
    "provider_hold_minimum_amount",
    "payout_hold_claimed_by",
    "payout_hold_claimed_at",
    "payout_blocked_at",
    "manual_payout_hold_started_at",
    "manual_payout_hold_alert_at",
    "manual_payout_hold_deadline_at",
    "manual_payout_hold_restore_settings",
    "last_onboarding_started_at",
    "last_provider_sync_at",
    "created_at",
    "updated_at",
].join(",");

export const marketplaceTermsHash = "c".repeat(64);

export function accountQuery(userId: string): Array<[string, string]> {
    return [
        ["cms_user_id", `eq.${userId}`],
        ["select", accountSelect],
        ["limit", "1"],
    ];
}

export function clearRequests(harness: AccountHandlerHarness): void {
    harness.rest.clearExternalRequestOrder();
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
}

export async function responseBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}
