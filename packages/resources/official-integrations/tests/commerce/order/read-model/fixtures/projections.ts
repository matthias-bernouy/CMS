export const seller = { id: 17, kind: "user", slug: "seller-17", display_name: "Seller 17" };

export const operation = {
    order_id: 42, order_public_id: "order-public-42", order_number: "CO-42",
    buyer_cms_user_id: "buyer-user-42", seller_id: 17, currency: "eur",
    buyer_total_amount: 11_070, seller_proceeds_amount: 9_000, platform_retained_amount: 2_070,
    financial_terms_hash: "terms-hash-42", payment_status: "succeeded",
    fulfillment_status: "in_transit", settlement_status: "held", claim_status: "open",
    total_refund_requested_amount: 620, release_eligible_at: "2026-07-20T12:00:00.000Z",
    recipient_handoff_at: null, recipient_handoff_first_observed_at: null,
    claim_window_started_at: null, claim_by_at: "2026-07-22T12:00:00.000Z",
    updated_at: "2026-07-12T13:00:00.000Z",
};

export const financialTerms = {
    order_id: 42, delivery_quote_id: "quote-42", merchandise_subtotal_amount: 10_000,
    shipping_amount: 450, buyer_protection_fee_amount: 620, seller_commission_amount: 1_000,
    buyer_total_amount: 11_070, seller_proceeds_amount: 9_000, platform_retained_amount: 2_070,
    currency: "eur", financial_terms_hash: "terms-hash-42",
    pricing_locked_at: "2026-07-12T12:01:00.000Z", pay_by_at: "2026-07-12T12:31:00.000Z",
    financial_revision: 2,
};

export const sellerFinancialTerms = {
    order_id: 42, merchandise_subtotal_amount: 10_000, shipping_amount: 450,
    seller_commission_amount: 1_000, platform_shipping_share_amount: 450,
    seller_shipping_share_amount: 0, seller_proceeds_amount: 9_000,
    seller_transfer_release_amount: 8_500, seller_reserve_liability_amount: 500,
    currency: "eur", pricing_locked_at: "2026-07-12T12:01:00.000Z",
    pay_by_at: "2026-07-12T12:31:00.000Z", financial_revision: 2,
};

export const fulfillment = {
    order_id: 42, status: "in_transit", seller_handoff_deadline: "2026-07-13T12:00:00.000Z",
    scan_grace_deadline: "2026-07-14T12:00:00.000Z", carrier_accepted_at: "2026-07-13T13:00:00.000Z",
    arrived_at_pickup_point_at: null, available_for_pickup_at: null, recipient_handoff_at: null,
    recipient_handoff_first_observed_at: null, claim_window_started_at: null,
    claim_by_at: "2026-07-22T12:00:00.000Z", release_eligible_at: "2026-07-20T12:00:00.000Z",
    blocking_reason: null, version: 4,
};

export const sellerFulfillment = {
    order_id: 42, status: "in_transit", seller_handoff_deadline: "2026-07-13T12:00:00.000Z",
    scan_grace_deadline: "2026-07-14T12:00:00.000Z",
    seller_handoff_declared_at: "2026-07-13T12:30:00.000Z",
    carrier_accepted_at: "2026-07-13T13:00:00.000Z", recipient_handoff_at: null,
    recipient_handoff_first_observed_at: null, claim_window_started_at: null,
    claim_by_at: "2026-07-22T12:00:00.000Z", release_eligible_at: "2026-07-20T12:00:00.000Z",
    blocking_reason: null, version: 4,
};

export const settlement = {
    order_id: 42, status: "held", authorized_seller_amount: 9_000,
    total_transferred_amount: 0, total_reversed_amount: 0, total_refunded_amount: 620,
    seller_reserve_liability_remaining_amount: 500, version: 2,
};

export const claim = {
    id: 88, public_id: "claim-public-88", reason: "damaged", status: "open",
    seller_response_by_at: "2026-07-15T12:00:00.000Z", return_ship_by_at: null,
    resolved_at: null, version: 1, created_at: "2026-07-14T12:00:00.000Z",
};

export const authorization = {
    allowed: false, reason: "shipment_not_collected", order_id: 42,
    order_public_id: "order-public-42", seller_id: 17, currency: "eur",
    payment_status: "succeeded", fulfillment_status: "in_transit",
    buyer_cms_user_id: "must-not-leak",
};
