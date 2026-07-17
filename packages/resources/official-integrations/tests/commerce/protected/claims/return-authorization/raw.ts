export const claimId = 3_000_000_007;
export const orderId = 3_000_000_042;
export const sellerId = 3_000_000_004;

export const claimRow = {
    id: claimId,
    public_id: "30000000-0000-4000-8000-000000000007",
    order_id: orderId,
    buyer_cms_user_id: "buyer-return-17",
    seller_id: sellerId,
    status: "return_required",
    resolution_outcome: "return_required",
    return_ship_by_at: "2099-07-25T08:00:00.000Z",
    return_delivery_status: "awaiting_carrier",
    return_recipient_handoff_at: null,
    version: 3,
    future_private_claim_field: "must-not-leak",
};

export const orderRow = {
    id: orderId,
    public_id: "00000000-0000-4000-8000-000000000042",
    order_number: "ORDER-RETURN-42",
    status: "active",
    shipping_address: {
        recipient: "Private Buyer",
        addressLine1: "17 Private Street",
    },
    future_private_order_field: "must-not-leak",
};

export const sellerRow = {
    id: sellerId,
    cms_user_id: "seller-return-17",
    future_private_seller_field: "must-not-leak",
};

export const financialTermsRow = {
    delivery_quote_id: "quote-return-42",
    merchandise_subtotal_amount: 10_000,
    currency: "eur",
    financial_terms_hash: "must-not-leak",
};

export const expectedAuthorization = {
    allowed: true,
    reason: "authorized",
    claimId,
    claimPublicId: claimRow.public_id,
    claimStatus: "return_required",
    claimVersion: 3,
    returnShipByAt: "2099-07-25T08:00:00.000Z",
    returnDeliveryStatus: "awaiting_carrier",
    orderId,
    orderPublicId: orderRow.public_id,
    orderNumber: "ORDER-RETURN-42",
    buyerCmsUserId: "buyer-return-17",
    sellerId,
    sellerCmsUserId: "seller-return-17",
    deliveryQuoteId: "quote-return-42",
    merchandiseSubtotalMinorAmount: 10_000,
    currency: "eur",
};
