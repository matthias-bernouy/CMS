export const sellerCmsUserId = "seller-subject";
export const sellerTermsVersion = "2026-07-13";
export const sellerTermsHash = "a".repeat(64);

export const seller = {
    exists: true,
    id: 184,
    kind: "user",
    cmsUserId: sellerCmsUserId,
    slug: "seller-subject",
    displayName: "Private seller name",
    verificationStatus: "pending",
    verifiedAt: null,
    metadata: {
        contactEmail: "private@example.test",
        address: "7 Private Street",
    },
    version: 3,
    createdAt: "2026-07-13T09:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
};

export const offerResult = {
    offer: {
        id: 42,
        sellerId: 184,
        productId: 71,
        variantId: null,
        slug: "sample-offer",
        title: "Sample offer",
        description: null,
        conditionCode: "good",
        publicationStatus: "draft",
        workflowState: "awaiting_final_approval",
        acceptedPriceAmount: null,
        currency: "eur",
        availability: "available",
        quantityAvailable: 1,
        inventoryRevision: 1,
        metadata: { color: "blue" },
        version: 4,
        createdAt: "2026-07-13T09:00:00.000Z",
        updatedAt: "2026-07-13T10:10:00.000Z",
    },
    proposal: {
        id: 81,
        offerId: 42,
        amount: 12_000,
        currency: "eur",
        status: "pending",
        proposedBy: sellerCmsUserId,
        decidedBy: null,
        decisionReason: null,
        decidedAt: null,
        createdAt: "2026-07-13T10:10:00.000Z",
    },
};

export const successfulInput = {
    offerId: "42",
    amount: 12_000,
    expectedVersion: 3,
    accountToken: "accttok_first",
    sellerTermsAccepted: true,
};

export function connectStatus(options: {
    enrolled?: boolean;
    currentTermsAccepted?: boolean;
    userId?: string;
} = {}) {
    const enrolled = options.enrolled ?? false;
    const currentTermsAccepted = options.currentTermsAccepted ?? false;
    return {
        exists: enrolled,
        userId: options.userId ?? sellerCmsUserId,
        connected: enrolled,
        accountStatus: enrolled ? "active" : "missing",
        termsStatus: enrolled ? "accepted" : "required",
        stripeTermsStatus: enrolled ? "accepted" : "required",
        marketplaceTermsStatus: enrolled ? "accepted" : "required",
        marketplaceTermsCurrentVersionAccepted: currentTermsAccepted,
        ...(enrolled
            ? {
                marketplaceTermsAcceptedAt: "2026-07-13T09:00:00.000Z",
                stripeAccountId: "acct_seller_price",
                stripeAccountApiVersion: "v2",
                riskStatus: "standard",
            }
            : {}),
        enrollmentStatus: enrolled ? "enrolled" : "not_started",
        onboardingStatus: "not_started",
        payoutsEnabled: false,
        applicationControlledRecipient: enrolled,
        stripeTransfersStatus: "unrequested",
        bankAccountStatus: "not_attached",
        bankPayoutsStatus: "unrequested",
        canAcceptHeldPayments: enrolled,
        canReceiveProtectedPayments: false,
        payoutBankReady: false,
        detailsSubmitted: false,
        chargesEnabled: false,
        currentlyDue: [],
        eventuallyDue: [],
        pastDue: [],
        pendingVerification: [],
    };
}
