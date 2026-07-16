export const buyerId = "buyer-user-42";
export const sellerUserId = "seller-user-17";

export const publicDefinitions = [
    { key: "insured", label: "Insured", field_type: "boolean", unit: null },
    { key: "weight", label: "Weight", field_type: "number", unit: "g" },
    { key: "publicNote", label: "Delivery note", field_type: "string", unit: null },
];

export const orderRows = [{
    id: 42, public_id: "order-public-42", order_number: "CO-42", checkout_group_id: "checkout-42",
    seller_id: 17, buyer_cms_user_id: buyerId, status: "paid", currency: "eur",
    subtotal_amount: 10_000, shipping_amount: 450, delivery_quoted_at: null, total_amount: 11_070,
    shipping_address: { recipient: "Buyer", addressLine1: "42 Market St", addressLine2: null },
    billing_address: { sameAsShipping: true },
    metadata: { publicNote: "Ring twice", weight: 305, insured: true, internalRisk: "high" },
    idempotency_key: "checkout-key-42", archived_at: null, version: 3,
    created_at: "2026-07-12T12:00:00.000Z", updated_at: "2026-07-12T12:05:00.000Z",
}, {
    id: 41, public_id: "order-public-41", order_number: "CO-41", checkout_group_id: "checkout-41",
    seller_id: 18, buyer_cms_user_id: buyerId, status: "awaiting_payment", currency: "eur",
    subtotal_amount: 8_000, shipping_amount: 0, delivery_quoted_at: "2026-07-11T11:02:00.000Z",
    total_amount: 8_300, shipping_address: { recipient: "Buyer", addressLine1: "41 Market St" },
    billing_address: {}, metadata: { publicNote: "Front desk", internalRisk: "low" },
    idempotency_key: "checkout-key-41", archived_at: "2026-07-13T08:00:00.000Z", version: 2,
    created_at: "2026-07-11T11:00:00.000Z", updated_at: "2026-07-13T08:00:00.000Z",
}];

export const saleRows = orderRows.map(({ seller_id: _seller, buyer_cms_user_id: _buyer,
    shipping_address: _shipping, billing_address: _billing, idempotency_key: _key,
    archived_at: _archived, ...sale }) => sale);

export const operationListRows = [{
    order_id: 42, payment_status: "succeeded", fulfillment_status: "in_transit",
    settlement_status: "held", claim_status: "open", total_refund_requested_amount: 620,
    updated_at: "2026-07-12T13:00:00.000Z",
}];

export const lineRows = [{
    id: 101, order_id: 42, offer_id: 501, product_id: 601, variant_id: null,
    accepted_proposal_id: null, title: "Tennis racket", sku: null, quantity: 1,
    unit_amount: 10_000, total_amount: 10_000,
    product_snapshot: { id: 601, slug: "racket", title: "Tennis racket" },
    variant_snapshot: null,
    offer_snapshot: { id: 501, slug: "racket-501", acceptedPriceAmount: 10_000 },
    seller_snapshot: { id: 17, kind: "user", slug: "seller-17", displayName: "Seller 17" },
    created_at: "2026-07-12T12:00:00.000Z",
}, {
    id: 102, order_id: 42, offer_id: 502, product_id: 602, variant_id: 702,
    accepted_proposal_id: 802, title: "Racket bag", sku: "BAG-BLACK", quantity: 2,
    unit_amount: 500, total_amount: 1_000,
    product_snapshot: { id: 602, slug: "bag", title: "Racket bag" },
    variant_snapshot: { id: 702, sku: "BAG-BLACK", title: "Black" },
    offer_snapshot: { id: 502, slug: "bag-502", acceptedPriceAmount: 500 },
    seller_snapshot: { id: 17, kind: "user", slug: "seller-17", displayName: "Seller 17" },
    created_at: "2026-07-12T12:00:01.000Z",
}];

export const buyerEventRows = [{
    id: 201, order_id: 42, event_type: "created", previous_status: null,
    next_status: "awaiting_payment", created_at: "2026-07-12T12:00:00.000Z",
}, {
    id: 202, order_id: 42, event_type: "paid", previous_status: "awaiting_payment",
    next_status: "paid", created_at: "2026-07-12T12:03:00.000Z",
}];

export const adminEventRows = buyerEventRows.map((event, index) => ({
    ...event, actor_kind: index ? "system" : "buyer", actor_id: index ? "stripe" : buyerId,
    message: index ? null : "Order created", data: index ? { provider: "stripe" } : {},
}));
