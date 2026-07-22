import type { JsonRecord } from "./harness";

export const adminAccountId = "acct_seller_admin_example_com";
export const adminIdempotencyKey =
    "cms_connect_account_v2_controlled_recipient_v2_355ac759e5344f804c6189c81022d8a0b648d9eb33aae81135d484f5f159dbf6";

export function expectedAccountCreation(): JsonRecord {
    return {
        contact_email: "seller-admin@example.com",
        display_name: "Seller Admin",
        dashboard: "none",
        identity: { country: "fr", entity_type: "individual" },
        defaults: {
            currency: "eur",
            profile: { product_description: "Sale of second-hand goods between individuals." },
            responsibilities: { fees_collector: "application", losses_collector: "application" },
        },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        include: ["configuration.recipient", "defaults", "identity", "requirements"],
    };
}

export function expectedAccountLink(): JsonRecord {
    return {
        account: adminAccountId,
        use_case: {
            type: "account_onboarding",
            account_onboarding: {
                configurations: ["recipient"],
                collection_options: { fields: "currently_due", future_requirements: "omit" },
                return_url: "https://market.example/account/payouts",
                refresh_url: "https://market.example/account/payouts",
            },
        },
    };
}

export function expectedAccountUpsert(): JsonRecord {
    return {
        cms_user_id: "seller-admin",
        stripe_account_api_version: "v2",
        stripe_account_id: adminAccountId,
        application_controlled_recipient: true,
        terms_accepted: true,
        provider_account_closed: false,
        country: "FR",
        business_type: "individual",
        onboarding_status: "enabled",
        charges_enabled: false,
        payouts_enabled: true,
        details_submitted: true,
        disabled_reason: null,
        capabilities: {
            stripe_balance: {
                stripe_transfers: { status: "active", status_details: [] },
                payouts: { status: "active", status_details: [] },
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

export function expectedResponse(lastOnboardingStartedAt: string): JsonRecord {
    return {
        exists: true,
        userId: "seller-admin",
        stripeAccountId: adminAccountId,
        stripeAccountApiVersion: "v2",
        connected: true,
        accountStatus: "active",
        termsStatus: "accepted",
        stripeTermsStatus: "accepted",
        marketplaceTermsStatus: "accepted",
        marketplaceTermsCurrentVersionAccepted: false,
        marketplaceTermsAcceptedAt: "2026-07-06T12:00:00.000Z",
        enrollmentStatus: "enrolled",
        country: "FR",
        businessType: "individual",
        onboardingStatus: "link_created",
        chargesEnabled: false,
        payoutsEnabled: true,
        detailsSubmitted: true,
        applicationControlledRecipient: true,
        stripeTransfersStatus: "active",
        bankAccountStatus: "not_attached",
        bankPayoutsStatus: "active",
        canAcceptHeldPayments: true,
        canReceiveProtectedPayments: false,
        payoutBankReady: false,
        disabledReason: null,
        currentlyDue: [],
        eventuallyDue: [],
        pastDue: [],
        pendingVerification: [],
        payoutSchedule: "stripe_default",
        riskStatus: "standard",
        financialHoldReason: null,
        outstandingDebtAmount: 0,
        financialExposureAmount: 0,
        riskRevision: 0,
        providerHoldMinimumAmount: 0,
        payoutBlockedAt: null,
        manualPayoutHoldStartedAt: null,
        manualPayoutHoldAlertAt: null,
        manualPayoutHoldDeadlineAt: null,
        lastOnboardingStartedAt,
        lastProviderSyncAt: null,
        occurredAt: "2026-07-06T12:10:00.000Z",
        createdAt: "2026-07-06T12:00:00.000Z",
        updatedAt: "2026-07-06T12:10:00.000Z",
        url: "https://connect.stripe.test/onboard",
        expiresAt: 1_800_000_000,
    };
}
