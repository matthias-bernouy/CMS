import type { JsonRecord } from "../types";

export function stripeAccountV1(userId: string, accountId: string): JsonRecord {
    return {
        id: accountId,
        country: "FR",
        business_type: "individual",
        charges_enabled: false,
        payouts_enabled: true,
        details_submitted: true,
        capabilities: { transfers: "active" },
        requirements: {
            currently_due: [],
            eventually_due: [],
            past_due: [],
            pending_verification: [],
            errors: [],
        },
        future_requirements: {},
        tos_acceptance: { service_agreement: "full" },
        metadata: { cms_user_id: userId },
    };
}

export function stripeAccountV2(accountId: string, email: string, custom = false): JsonRecord {
    return {
        id: accountId,
        object: "v2.core.account",
        applied_configurations: ["recipient"],
        contact_email: email,
        display_name: email.split("@")[0],
        dashboard: "none",
        identity: {
            country: "FR",
            entity_type: "individual",
            attestations: {
                terms_of_service: { account: { shown_and_accepted: true } },
            },
        },
        defaults: {
            currency: "eur",
            responsibilities: {
                fees_collector: "application",
                losses_collector: "application",
                requirements_collector: "application",
            },
        },
        configuration: {
            recipient: {
                applied: true,
                capabilities: {
                    stripe_balance: {
                        stripe_transfers: { status: "active", status_details: [] },
                        payouts: { status: custom ? "unrequested" : "active", status_details: [] },
                    },
                },
            },
        },
        requirements: { entries: [], summary: null },
        future_requirements: { entries: [], summary: null },
        closed: false,
    };
}

export function defaultAccountRow(userId: string, now: string): JsonRecord {
    return {
        cms_user_id: userId,
        stripe_account_id: null,
        stripe_account_api_version: "v1",
        application_controlled_recipient: false,
        terms_accepted: false,
        provider_account_closed: false,
        external_bank_account_attached: false,
        marketplace_terms_version: "legacy-test-fixture",
        marketplace_terms_hash: "b".repeat(64),
        marketplace_terms_accepted_at: now,
        country: "FR",
        business_type: null,
        onboarding_status: "not_started",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        disabled_reason: null,
        capabilities: {},
        requirements_currently_due: [],
        requirements_eventually_due: [],
        requirements_past_due: [],
        requirements_pending_verification: [],
        requirements_errors: [],
        future_requirements: {},
        payout_schedule: "stripe_default",
        risk_status: "standard",
        financial_hold_reason: null,
        outstanding_debt_amount: 0,
        financial_exposure_amount: 0,
        risk_revision: 0,
        provider_hold_minimum_amount: 0,
        payout_hold_claimed_by: null,
        payout_hold_claimed_at: null,
        payout_blocked_at: null,
        manual_payout_hold_started_at: null,
        manual_payout_hold_alert_at: null,
        manual_payout_hold_deadline_at: null,
        manual_payout_hold_restore_settings: null,
        last_onboarding_started_at: null,
        last_provider_sync_at: null,
        created_at: now,
        updated_at: now,
    };
}
