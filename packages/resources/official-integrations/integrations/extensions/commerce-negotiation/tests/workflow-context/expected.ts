export const offer = {
    id: 42,
    sellerId: 17,
    slug: "smoke-racket",
    title: "Smoke racket",
    acceptedPriceAmount: 10_000,
    currency: "eur",
    publicationStatus: "active",
    availability: "available",
};

export const seller = {
    id: 17,
    cmsUserId: "seller-user",
    displayName: "Seller",
};

export const negotiationContext = {
    offerId: offer.id,
    offerSlug: offer.slug,
    offerTitle: offer.title,
    sellerCmsUserId: seller.cmsUserId,
    sellerDisplayName: seller.displayName,
    referenceAmount: offer.acceptedPriceAmount,
    currency: offer.currency,
    publicationStatus: offer.publicationStatus,
    availability: offer.availability,
};

export const policy = {
    enabled: true,
    canPropose: true,
    offerId: offer.id,
    referenceAmount: offer.acceptedPriceAmount,
    minimumAmount: 8_000,
    maximumAmount: 12_000,
    currency: offer.currency,
    expiresAfterHours: 72,
};

export const proposal = {
    id: 71,
    publicId: "proposal-public-71",
    offerId: offer.id,
    offerSlug: offer.slug,
    offerTitle: offer.title,
    sellerUserId: seller.cmsUserId,
    sellerDisplayName: seller.displayName,
    buyerUserId: "buyer-user",
    referenceAmount: offer.acceptedPriceAmount,
    minimumAmount: 8_000,
    maximumAmount: 12_000,
    proposedAmount: 9_500,
    currency: offer.currency,
    buyerMessage: "Could you accept this price?",
    decisionMessage: null,
    status: "pending",
    version: 1,
    expiresAt: "2026-07-20T12:00:00Z",
    acceptedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    createdAt: "2026-07-17T12:00:00Z",
    updatedAt: "2026-07-17T12:00:00Z",
};
