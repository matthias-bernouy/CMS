export const expectedFirstPublicMetadata = { publicNote: "Ring twice", weight: 305, insured: true };
export const expectedFirstEntries = [
    { key: "insured", label: "Insured", type: "boolean", value: "true" },
    { key: "weight", label: "Weight", type: "number", value: "305", unit: "g" },
    { key: "publicNote", label: "Delivery note", type: "string", value: "Ring twice" },
];
const secondEntries = [
    { key: "publicNote", label: "Delivery note", type: "string", value: "Front desk" },
];
const operation = {
    orderId: 42, paymentStatus: "succeeded", fulfillmentStatus: "in_transit",
    settlementStatus: "held", claimStatus: "open", totalRefundRequestedAmount: 620,
    updatedAt: "2026-07-12T13:00:00.000Z",
};

export const expectedFirstAdminOrder = {
    id: 42, publicId: "order-public-42", orderNumber: "CO-42", checkoutGroupId: "checkout-42",
    sellerId: 17, buyerCmsUserId: "buyer-user-42", status: "paid", currency: "eur",
    subtotalAmount: 10_000, shippingAmount: 450, deliveryQuotedAt: null, totalAmount: 11_070,
    shippingAddress: { recipient: "Buyer", addressLine1: "42 Market St", addressLine2: null },
    billingAddress: { sameAsShipping: true }, idempotencyKey: "checkout-key-42", archivedAt: null,
    version: 3, createdAt: "2026-07-12T12:00:00.000Z", updatedAt: "2026-07-12T12:05:00.000Z",
};
const secondOrder = {
    id: 41, publicId: "order-public-41", orderNumber: "CO-41", checkoutGroupId: "checkout-41",
    sellerId: 18, buyerCmsUserId: "buyer-user-42", status: "awaiting_payment", currency: "eur",
    subtotalAmount: 8_000, shippingAmount: 0, deliveryQuotedAt: "2026-07-11T11:02:00.000Z",
    totalAmount: 8_300, shippingAddress: { recipient: "Buyer", addressLine1: "41 Market St" },
    billingAddress: {}, idempotencyKey: "checkout-key-41", archivedAt: "2026-07-13T08:00:00.000Z",
    version: 2, createdAt: "2026-07-11T11:00:00.000Z", updatedAt: "2026-07-13T08:00:00.000Z",
};

export const expectedBuyerList = {
    items: [
        { ...expectedFirstAdminOrder, metadata: expectedFirstPublicMetadata, operation, metadataEntries: expectedFirstEntries },
        { ...secondOrder, metadata: { publicNote: "Front desk" }, operation: null, metadataEntries: secondEntries },
    ],
    total: 7, limit: 2, offset: 2,
};

export const expectedAdminList = {
    items: [
        { ...expectedFirstAdminOrder, metadata: { publicNote: "Ring twice", weight: 305, insured: true, internalRisk: "high" }, operation },
        { ...secondOrder, metadata: { publicNote: "Front desk", internalRisk: "low" }, operation: null },
    ],
    total: 7, limit: 2, offset: 2,
};

export const expectedSellerList = {
    items: [{
        id: 42, publicId: "order-public-42", orderNumber: "CO-42", checkoutGroupId: "checkout-42",
        status: "paid", currency: "eur", subtotalAmount: 10_000, shippingAmount: 450,
        deliveryQuotedAt: null, totalAmount: 11_070, metadata: expectedFirstPublicMetadata, version: 3,
        createdAt: "2026-07-12T12:00:00.000Z", updatedAt: "2026-07-12T12:05:00.000Z",
        metadataEntries: expectedFirstEntries,
    }, {
        id: 41, publicId: "order-public-41", orderNumber: "CO-41", checkoutGroupId: "checkout-41",
        status: "awaiting_payment", currency: "eur", subtotalAmount: 8_000, shippingAmount: 0,
        deliveryQuotedAt: "2026-07-11T11:02:00.000Z", totalAmount: 8_300,
        metadata: { publicNote: "Front desk" }, version: 2,
        createdAt: "2026-07-11T11:00:00.000Z", updatedAt: "2026-07-13T08:00:00.000Z",
        metadataEntries: secondEntries,
    }],
    total: 7, limit: 2, offset: 2,
};
