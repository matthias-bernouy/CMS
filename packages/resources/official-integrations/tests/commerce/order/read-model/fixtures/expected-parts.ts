export const expectedAdminLines = [{
    id: 101, orderId: 42, offerId: 501, productId: 601, variantId: null,
    acceptedProposalId: null, title: "Tennis racket", sku: null, quantity: 1,
    unitAmount: 10_000, totalAmount: 10_000,
    productSnapshot: { id: 601, slug: "racket", title: "Tennis racket" },
    variantSnapshot: null,
    offerSnapshot: { id: 501, slug: "racket-501", acceptedPriceAmount: 10_000 },
    sellerSnapshot: { id: 17, kind: "user", slug: "seller-17", displayName: "Seller 17" },
    createdAt: "2026-07-12T12:00:00.000Z",
}, {
    id: 102, orderId: 42, offerId: 502, productId: 602, variantId: 702,
    acceptedProposalId: 802, title: "Racket bag", sku: "BAG-BLACK", quantity: 2,
    unitAmount: 500, totalAmount: 1_000,
    productSnapshot: { id: 602, slug: "bag", title: "Racket bag" },
    variantSnapshot: { id: 702, sku: "BAG-BLACK", title: "Black" },
    offerSnapshot: { id: 502, slug: "bag-502", acceptedPriceAmount: 500 },
    sellerSnapshot: { id: 17, kind: "user", slug: "seller-17", displayName: "Seller 17" },
    createdAt: "2026-07-12T12:00:01.000Z",
}];

export const expectedSellerLines = expectedAdminLines.map(({ sellerSnapshot: _seller, ...line }) => line);

export const expectedBuyerEvents = [{
    id: 201, orderId: 42, eventType: "created", previousStatus: null,
    nextStatus: "awaiting_payment", createdAt: "2026-07-12T12:00:00.000Z",
}, {
    id: 202, orderId: 42, eventType: "paid", previousStatus: "awaiting_payment",
    nextStatus: "paid", createdAt: "2026-07-12T12:03:00.000Z",
}];

export const expectedAdminEvents = expectedBuyerEvents.map((event, index) => ({
    ...event, actorKind: index ? "system" : "buyer", actorId: index ? "stripe" : "buyer-user-42",
    message: index ? null : "Order created", data: index ? { provider: "stripe" } : {},
}));

export const expectedOperation = {
    orderId: 42, orderPublicId: "order-public-42", orderNumber: "CO-42",
    buyerCmsUserId: "buyer-user-42", sellerId: 17, currency: "eur",
    buyerTotalAmount: 11_070, sellerProceedsAmount: 9_000, platformRetainedAmount: 2_070,
    financialTermsHash: "terms-hash-42", paymentStatus: "succeeded",
    fulfillmentStatus: "in_transit", settlementStatus: "held", claimStatus: "open",
    totalRefundRequestedAmount: 620, releaseEligibleAt: "2026-07-20T12:00:00.000Z",
    recipientHandoffAt: null, recipientHandoffFirstObservedAt: null,
    claimWindowStartedAt: null, claimByAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-12T13:00:00.000Z",
};

export const expectedFinancialTerms = {
    orderId: 42, deliveryQuoteId: "quote-42", merchandiseSubtotalAmount: 10_000,
    shippingAmount: 450, buyerProtectionFeeAmount: 620, sellerCommissionAmount: 1_000,
    buyerTotalAmount: 11_070, sellerProceedsAmount: 9_000, platformRetainedAmount: 2_070,
    currency: "eur", financialTermsHash: "terms-hash-42",
    pricingLockedAt: "2026-07-12T12:01:00.000Z", payByAt: "2026-07-12T12:31:00.000Z",
    financialRevision: 2,
};

export const expectedFulfillment = {
    orderId: 42, status: "in_transit", sellerHandoffDeadline: "2026-07-13T12:00:00.000Z",
    scanGraceDeadline: "2026-07-14T12:00:00.000Z", carrierAcceptedAt: "2026-07-13T13:00:00.000Z",
    arrivedAtPickupPointAt: null, availableForPickupAt: null, recipientHandoffAt: null,
    recipientHandoffFirstObservedAt: null, claimWindowStartedAt: null,
    claimByAt: "2026-07-22T12:00:00.000Z", releaseEligibleAt: "2026-07-20T12:00:00.000Z",
    blockingReason: null, version: 4,
};

export const expectedSettlement = {
    orderId: 42, status: "held", authorizedSellerAmount: 9_000,
    totalTransferredAmount: 0, totalReversedAmount: 0, totalRefundedAmount: 620,
    sellerReserveLiabilityRemainingAmount: 500, version: 2,
};

export const expectedClaim = {
    id: 88, publicId: "claim-public-88", reason: "damaged", status: "open",
    sellerResponseByAt: "2026-07-15T12:00:00.000Z", returnShipByAt: null,
    resolvedAt: null, version: 1, createdAt: "2026-07-14T12:00:00.000Z",
};
