import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import type { JsonRecord } from "../../shared/types.ts";
import {
    bankPayoutsStatus,
    sellerCanAcceptHeldPayments,
    sellerCanReceivePayments,
    sellerEnrollmentStatus,
    stripeTransfersStatus,
} from "./eligibility.ts";

export function publicAccountStatus(
    row: ConnectAccountRow | null,
    userId: string,
    options: { currentTermsAccepted?: boolean; marketplaceTermsRequirement?: JsonRecord | null } = {},
): JsonRecord {
    if (!row) {
        return {
            exists: false,
            userId,
            connected: false,
            accountStatus: "missing",
            termsStatus: "required",
            stripeTermsStatus: "required",
            marketplaceTermsStatus: "required",
            marketplaceTermsCurrentVersionAccepted: false,
            ...(options.marketplaceTermsRequirement !== undefined
                ? { marketplaceTermsRequirement: options.marketplaceTermsRequirement }
                : {}),
            enrollmentStatus: "not_started",
            onboardingStatus: "not_started",
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
            applicationControlledRecipient: false,
            stripeTransfersStatus: "unrequested",
            bankAccountStatus: "not_attached",
            bankPayoutsStatus: "unrequested",
            canAcceptHeldPayments: false,
            canReceiveProtectedPayments: false,
            payoutBankReady: false,
            currentlyDue: [],
            eventuallyDue: [],
            pastDue: [],
            pendingVerification: [],
        };
    }
    return publicAccount(row, options);
}

export function publicAccount(
    row: ConnectAccountRow,
    options: { currentTermsAccepted?: boolean; marketplaceTermsRequirement?: JsonRecord | null } = {},
): JsonRecord {
    const transferStatus = stripeTransfersStatus(row);
    const payoutStatus = bankPayoutsStatus(row);
    const marketplaceTermsAccepted = Boolean(row.marketplace_terms_accepted_at);
    return {
        exists: true,
        userId: row.cms_user_id,
        stripeAccountId: row.stripe_account_id,
        stripeAccountApiVersion: row.stripe_account_api_version,
        connected: Boolean(row.stripe_account_id),
        accountStatus: row.stripe_account_id ? (row.provider_account_closed ? "closed" : "active") : "missing",
        termsStatus: row.terms_accepted && marketplaceTermsAccepted ? "accepted" : "required",
        stripeTermsStatus: row.terms_accepted ? "accepted" : "required",
        marketplaceTermsStatus: marketplaceTermsAccepted ? "accepted" : "required",
        marketplaceTermsCurrentVersionAccepted: options.currentTermsAccepted === true,
        ...(options.marketplaceTermsRequirement !== undefined
            ? { marketplaceTermsRequirement: options.marketplaceTermsRequirement }
            : {}),
        marketplaceTermsAcceptedAt: row.marketplace_terms_accepted_at,
        enrollmentStatus: sellerEnrollmentStatus(row),
        country: row.country,
        businessType: row.business_type,
        onboardingStatus: row.onboarding_status,
        chargesEnabled: row.charges_enabled,
        payoutsEnabled: row.payouts_enabled,
        detailsSubmitted: row.details_submitted,
        applicationControlledRecipient: row.application_controlled_recipient,
        stripeTransfersStatus: transferStatus,
        bankAccountStatus: row.external_bank_account_attached ? "attached" : "not_attached",
        bankPayoutsStatus: payoutStatus,
        canAcceptHeldPayments: sellerCanAcceptHeldPayments(row),
        canReceiveProtectedPayments: sellerCanReceivePayments(row),
        payoutBankReady: row.external_bank_account_attached && payoutStatus === "active",
        disabledReason: row.disabled_reason,
        currentlyDue: row.requirements_currently_due,
        eventuallyDue: row.requirements_eventually_due,
        pastDue: row.requirements_past_due,
        pendingVerification: row.requirements_pending_verification,
        payoutSchedule: row.payout_schedule,
        riskStatus: row.risk_status,
        financialHoldReason: row.financial_hold_reason,
        outstandingDebtAmount: row.outstanding_debt_amount,
        financialExposureAmount: row.financial_exposure_amount,
        riskRevision: row.risk_revision,
        providerHoldMinimumAmount: row.provider_hold_minimum_amount,
        payoutBlockedAt: row.payout_blocked_at,
        manualPayoutHoldStartedAt: row.manual_payout_hold_started_at,
        manualPayoutHoldAlertAt: row.manual_payout_hold_alert_at,
        manualPayoutHoldDeadlineAt: row.manual_payout_hold_deadline_at,
        lastOnboardingStartedAt: row.last_onboarding_started_at,
        lastProviderSyncAt: row.last_provider_sync_at,
        occurredAt: row.updated_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
