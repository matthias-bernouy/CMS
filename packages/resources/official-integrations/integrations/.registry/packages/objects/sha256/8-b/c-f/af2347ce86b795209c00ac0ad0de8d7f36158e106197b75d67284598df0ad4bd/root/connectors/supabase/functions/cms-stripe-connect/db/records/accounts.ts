import type { JsonRecord } from "../../shared/types.ts";

export type ConnectAccountRow = {
    cms_user_id: string;
    stripe_account_id: string | null;
    stripe_account_api_version: "v1" | "v2";
    application_controlled_recipient: boolean;
    terms_accepted: boolean;
    provider_account_closed: boolean;
    external_bank_account_attached: boolean;
    marketplace_terms_version: string | null;
    marketplace_terms_hash: string | null;
    marketplace_terms_accepted_at: string | null;
    country: string;
    business_type: string | null;
    onboarding_status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    disabled_reason: string | null;
    capabilities: JsonRecord;
    requirements_currently_due: string[];
    requirements_eventually_due: string[];
    requirements_past_due: string[];
    requirements_pending_verification: string[];
    requirements_errors: unknown[];
    future_requirements: JsonRecord;
    payout_schedule: string;
    risk_status: string;
    financial_hold_reason: string | null;
    outstanding_debt_amount: number;
    financial_exposure_amount: number;
    risk_revision: number;
    provider_hold_minimum_amount: number;
    payout_hold_claimed_by: string | null;
    payout_hold_claimed_at: string | null;
    payout_blocked_at: string | null;
    manual_payout_hold_started_at: string | null;
    manual_payout_hold_alert_at: string | null;
    manual_payout_hold_deadline_at: string | null;
    manual_payout_hold_restore_settings: JsonRecord | null;
    last_onboarding_started_at: string | null;
    last_provider_sync_at: string | null;
    created_at: string;
    updated_at: string;
};

export type MarketplaceTermsAcceptanceRow = {
    cms_user_id: string;
    terms_version: string;
    terms_hash: string;
    terms_version_id?: string | null;
    accepted_at: string;
};

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
