import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import { objectAt } from "../../shared/data.ts";

export function sellerCanReceivePayments(account: ConnectAccountRow): boolean {
    return Boolean(
        account.stripe_account_id &&
            account.stripe_account_api_version === "v2" &&
            account.terms_accepted &&
            Boolean(account.marketplace_terms_accepted_at) &&
            !account.provider_account_closed &&
            account.onboarding_status === "enabled" &&
            stripeTransfersStatus(account) === "active" &&
            account.details_submitted &&
            account.application_controlled_recipient &&
            account.requirements_currently_due.length === 0 &&
            account.requirements_past_due.length === 0 &&
            account.requirements_pending_verification.length === 0 &&
            !["restricted", "blocked", "manual_review"].includes(account.risk_status) &&
            account.outstanding_debt_amount === 0 &&
            account.financial_exposure_amount === 0 &&
            !account.financial_hold_reason &&
            !account.manual_payout_hold_started_at,
    );
}

export function sellerCanAcceptHeldPayments(account: ConnectAccountRow): boolean {
    return Boolean(
        account.stripe_account_id &&
            account.stripe_account_api_version === "v2" &&
            account.application_controlled_recipient &&
            account.terms_accepted &&
            account.terms_accepted &&
            Boolean(account.marketplace_terms_accepted_at) &&
            !account.provider_account_closed &&
            account.onboarding_status !== "rejected" &&
            !["restricted", "blocked", "manual_review"].includes(account.risk_status) &&
            account.outstanding_debt_amount === 0 &&
            account.financial_exposure_amount === 0 &&
            !account.financial_hold_reason &&
            !account.manual_payout_hold_started_at,
    );
}

export function sellerStripeEnrollmentReady(account: ConnectAccountRow): boolean {
    return Boolean(
        account.stripe_account_id &&
            account.stripe_account_api_version === "v2" &&
            account.application_controlled_recipient &&
            account.terms_accepted &&
            !account.provider_account_closed &&
            account.onboarding_status !== "rejected",
    );
}

export function stripeTransfersStatus(account: ConnectAccountRow): string {
    if (account.stripe_account_api_version === "v1") {
        return (
            normalizedCapabilityStatus(account.capabilities.transfers) ||
            (account.payouts_enabled ? "active" : "unrequested")
        );
    }
    const stripeBalance = objectAt(account.capabilities, "stripe_balance");
    return normalizedCapabilityStatus(objectAt(stripeBalance, "stripe_transfers").status) || "unrequested";
}

export function bankPayoutsStatus(account: ConnectAccountRow): string {
    if (account.stripe_account_api_version === "v1") {
        return account.payouts_enabled ? "active" : "unrequested";
    }
    const stripeBalance = objectAt(account.capabilities, "stripe_balance");
    return normalizedCapabilityStatus(objectAt(stripeBalance, "payouts").status) || "unrequested";
}

function normalizedCapabilityStatus(value: unknown): string {
    return typeof value === "string" &&
        ["active", "pending", "restricted", "unsupported", "unrequested"].includes(value)
        ? value
        : "";
}

export function sellerEnrollmentStatus(account: ConnectAccountRow): string {
    if (!account.stripe_account_id) {
        return "not_started";
    }
    if (account.provider_account_closed || account.onboarding_status === "rejected") {
        return "rejected";
    }
    if (account.stripe_account_api_version !== "v2" || !account.application_controlled_recipient) {
        return "rejected";
    }
    if (!account.terms_accepted || !account.marketplace_terms_accepted_at) {
        return "terms_required";
    }
    return "enrolled";
}
