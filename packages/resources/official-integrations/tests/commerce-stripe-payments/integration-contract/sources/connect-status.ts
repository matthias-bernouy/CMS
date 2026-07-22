export function connectStatus({
    enrolled = false,
    currentTermsAccepted = false,
}: {
    enrolled?: boolean;
    currentTermsAccepted?: boolean;
} = {}): Record<string, unknown> {
    const ready = enrolled && currentTermsAccepted;
    return {
        exists: enrolled,
        userId: "seller-subject",
        connected: enrolled,
        ...(enrolled ? { stripeAccountId: "acct_seller", stripeAccountApiVersion: "v2" } : {}),
        onboardingStatus: ready ? "enrolled" : enrolled ? "terms_required" : "not_started",
        payoutsEnabled: false,
        riskStatus: "standard",
        applicationControlledRecipient: enrolled,
        canAcceptHeldPayments: ready,
        canReceiveProtectedPayments: false,
        payoutBankReady: false,
        accountStatus: enrolled ? "active" : "missing",
        termsStatus: ready ? "accepted" : "required",
        stripeTermsStatus: enrolled ? "accepted" : "required",
        marketplaceTermsStatus: currentTermsAccepted ? "accepted" : "required",
        marketplaceTermsCurrentVersionAccepted: currentTermsAccepted,
        enrollmentStatus: ready ? "enrolled" : enrolled ? "terms_required" : "not_started",
        stripeTransfersStatus: "unrequested",
        bankAccountStatus: "not_attached",
        bankPayoutsStatus: "unrequested",
        detailsSubmitted: enrolled,
        chargesEnabled: false,
        currentlyDue: enrolled ? [] : ["identity.individual.given_name"],
        eventuallyDue: [],
        pastDue: [],
        pendingVerification: [],
    };
}
