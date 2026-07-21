export const sellerId = "seller-subject";
export const buyerId = "buyer-subject";
export const orderId = 42;
export const orderPublicId = "order-public-42";

export const sellerSetup = {
    id: orderId,
    publicId: orderPublicId,
    allowed: true,
    sellerId,
    metadata: { buyerAddress: "7 Private Street" },
    financialTermsHash: "terms-42",
};

export const reservation = {
    operationId: 501,
    claimToken: "00000000-0000-4000-8000-000000000501",
    businessKey: "shipment-creation:42:quote-42",
    status: "processing",
    orderId,
    orderPublicId,
    sellerId,
    buyerCmsUserId: buyerId,
    deliveryQuoteId: "quote-42",
    merchandiseSubtotalMinorAmount: 11_000,
    currency: "EUR",
    financialTermsHash: "terms-42",
    fulfillmentStatus: "shipment_creating",
};
