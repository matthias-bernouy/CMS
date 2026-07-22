import { accountQuery, accountSelect, type JsonRecord } from "./harness";

export const termsVersion = "courtside-seller-2026-07";
export const nextTermsVersion = "courtside-seller-2026-08";
export const nextTermsHash = "d".repeat(64);

export function expectedReloadRequests() {
    return [
        { method: "GET", table: "accounts", searchParams: accountQuery("user-123"), body: null },
        {
            method: "PATCH",
            table: "accounts",
            searchParams: [
                ["cms_user_id", "eq.user-123"],
                ["select", accountSelect],
            ],
            body: expectedProviderPatch(),
        },
        {
            method: "GET",
            table: "marketplace_terms_acceptances",
            searchParams: [
                ["cms_user_id", "eq.user-123"],
                ["terms_version", `eq.${nextTermsVersion}`],
                ["terms_hash", `eq.${nextTermsHash}`],
                ["select", "cms_user_id,terms_version,terms_hash,accepted_at"],
                ["limit", "1"],
            ],
            body: null,
        },
        {
            method: "POST",
            table: "rpc/record_marketplace_terms_acceptance",
            searchParams: [],
            body: {
                p_cms_user_id: "user-123",
                p_terms_version: nextTermsVersion,
                p_terms_hash: nextTermsHash,
            },
        },
        { method: "GET", table: "accounts", searchParams: accountQuery("user-123"), body: null },
    ];
}

function expectedProviderPatch(): JsonRecord {
    return {
        stripe_account_id: "acct_custom_identity_123",
        application_controlled_recipient: true,
        terms_accepted: true,
        provider_account_closed: false,
        country: "FR",
        business_type: "individual",
        onboarding_status: "enabled",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        disabled_reason: null,
        capabilities: {
            stripe_balance: {
                stripe_transfers: { status: "active", status_details: [] },
                payouts: { status: "unrequested", status_details: [] },
            },
        },
        requirements_currently_due: [],
        requirements_eventually_due: [],
        requirements_past_due: [],
        requirements_pending_verification: [],
        requirements_errors: [],
        future_requirements: { entries: [], summary: null },
    };
}
