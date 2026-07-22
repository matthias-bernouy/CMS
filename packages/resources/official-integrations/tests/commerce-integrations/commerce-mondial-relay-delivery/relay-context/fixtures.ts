export const buyerId = "buyer-subject";
export const sellerId = "seller-subject";
export const orderPublicId = "00000000-0000-4000-8000-000000000042";
export const savedQuoteId = `mrq_${"a".repeat(64)}`;

export const order = {
    id: 42,
    publicId: orderPublicId,
    buyerCmsUserId: buyerId,
    status: "awaiting_quote",
    version: 1,
    financialTerms: null,
    shippingAddress: { addressLine1: "must not cross the workflow" },
    lines: [{ title: "must not cross the workflow" }],
};
export const finalizedOrder = {
    ...order,
    status: "awaiting_payment",
    financialTerms: { deliveryQuoteId: savedQuoteId },
};

export const authorization = {
    orderId: 42,
    orderPublicId,
    orderVersion: 1,
    status: "awaiting_quote",
    buyerCmsUserId: buyerId,
    sellerCmsUserId: sellerId,
    currency: "eur",
    merchandiseSubtotalMinorAmount: 1000,
    shippingAddress: {
        recipient: "Alice Buyer",
        phone: "+33600000000",
        addressLine1: "1 rue du Test",
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
    },
};

export const sellerAccount = {
    exists: true,
    userId: sellerId,
    givenName: "Seller",
    surname: "Test",
    birthDate: "1990-01-01",
    phone: "+33611111111",
    addressLine1: "2 rue du Vendeur",
    addressLine2: null,
    addressLine3: null,
    postalCode: "69001",
    city: "Lyon",
    region: "Auvergne-Rhône-Alpes",
    countryCode: "FR",
    avatarUrl: null,
    avatarFileId: null,
    locale: "fr-FR",
    timezone: "Europe/Paris",
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-12T09:00:00.000Z",
};

export const publicRelayPoint = {
    quoteId: savedQuoteId,
    externalOrderId: orderPublicId,
    relayLocation: "FR-024474",
    country: "FR",
    number: "024474",
    name: "RELAIS G20 RUE REAUMUR",
    addressLine1: "85 rue Réaumur",
    addressLine2: "",
    postalCode: "75002",
    city: "PARIS",
    nature: "",
    pointType: "",
    weightGrams: 500,
    shippingAmount: 450,
    currency: "eur",
    quotedAt: "2026-07-13T10:00:00.000Z",
    expiresAt: "2099-07-13T10:15:00.000Z",
};

export const savedQuote = {
    ...deliveryQuote(savedQuoteId, 450),
    latitude: 48.864,
    longitude: 2.348,
};
export const resolvedQuote = {
    ...savedQuote,
    recipientSnapshot: { phone: "+33600000000" },
    sellerFulfillmentSnapshot: { phone: "+33611111111" },
};

export const lockedFinancialTerms = {
    orderId: 42,
    deliveryQuoteId: savedQuoteId,
    merchandiseSubtotalAmount: 1000,
    shippingAmount: 450,
    buyerProtectionFeeAmount: 100,
    buyerTotalAmount: 1550,
    sellerTransferReleaseAmount: 850,
    currency: "eur",
    financialTermsHash: "terms-resolved-42",
    financialRevision: 1,
};

function deliveryQuote(quoteId: string, shippingAmount: number) {
    return {
        ...publicRelayPoint,
        quoteId,
        orderVersion: 1,
        revision: 1,
        selectedForCmsUserId: buyerId,
        nature: "",
        pointType: "",
        shippingAmount,
        merchandiseSubtotalMinorAmount: 1000,
    };
}
