insert into commerce.sellers (kind, cms_user_id, slug, display_name)
values ('user', 'order-read-seller-17', 'order-read-seller-17', 'Order read seller 17')
returning id as seller_17_id \gset
insert into commerce.sellers (kind, cms_user_id, slug, display_name)
values ('user', 'order-read-seller-18', 'order-read-seller-18', 'Order read seller 18')
returning id as seller_18_id \gset

insert into commerce.checkout_groups (id, buyer_cms_user_id, idempotency_key, request_hash)
values
    ('10000000-0000-4000-8000-000000000041', 'order-read-buyer-a', 'order-41', repeat('1', 32)),
    ('10000000-0000-4000-8000-000000000042', 'order-read-buyer-a', 'order-42', repeat('2', 32)),
    ('10000000-0000-4000-8000-000000000043', 'order-read-buyer-b', 'order-43', repeat('3', 32));

insert into commerce.orders (
    public_id, order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    status, currency, subtotal_amount, shipping_amount, total_amount,
    idempotency_key, request_hash, created_at, updated_at
) values (
    '00000000-0000-4000-8000-000000000041', 'ORDER-READ-41',
    '10000000-0000-4000-8000-000000000041', :seller_17_id,
    'order-read-buyer-a', 'awaiting_payment', 'eur', 8000, 0, 8000,
    'order-41', repeat('1', 32), '2026-07-16 11:00+00', '2026-07-16 11:00+00'
) returning id as order_41_id \gset
insert into commerce.orders (
    public_id, order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    status, currency, subtotal_amount, shipping_amount, total_amount,
    idempotency_key, request_hash, created_at, updated_at
) values (
    '00000000-0000-4000-8000-000000000042', 'ORDER-READ-42',
    '10000000-0000-4000-8000-000000000042', :seller_17_id,
    'order-read-buyer-a', 'active', 'eur', 10000, 450, 11070,
    'order-42', repeat('2', 32), '2026-07-17 12:00+00', '2026-07-17 12:05+00'
) returning id as order_42_id \gset
insert into commerce.orders (
    public_id, order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    status, currency, subtotal_amount, shipping_amount, total_amount,
    idempotency_key, request_hash, created_at, updated_at
) values (
    '00000000-0000-4000-8000-000000000043', 'ORDER-READ-43',
    '10000000-0000-4000-8000-000000000043', :seller_18_id,
    'order-read-buyer-b', 'completed', 'eur', 5000, 0, 5000,
    'order-43', repeat('3', 32), '2026-07-17 12:00+00', '2026-07-17 12:06+00'
) returning id as order_43_id \gset

insert into commerce.order_events (
    id, order_id, event_type, actor_kind, actor_id, previous_status,
    next_status, message, data, created_at
) values
    (9400000000202, :order_42_id, 'paid', 'system', 'stripe',
        'awaiting_payment', 'active', null, '{"provider":"stripe"}', '2026-07-17 12:04+00'),
    (9400000000201, :order_42_id, 'created', 'buyer', 'order-read-buyer-a',
        null, 'awaiting_payment', 'Order created', '{}', '2026-07-17 12:00+00');

select active_c2c_fee_policy_id as fee_id,
    active_c2c_protection_policy_id as protection_id,
    active_c2c_seller_risk_policy_id as risk_id
from commerce.settings where id = 'default' \gset
select version as fee_version from commerce.fee_policies where id = :fee_id \gset
select version as protection_version from commerce.protection_policies where id = :protection_id \gset
select version as risk_version from commerce.seller_risk_policies where id = :risk_id \gset

insert into commerce.order_financial_terms (
    order_id, fee_policy_id, fee_policy_version, fee_policy_snapshot,
    protection_policy_id, protection_policy_version, protection_policy_snapshot,
    seller_risk_policy_id, seller_risk_policy_version, seller_risk_policy_snapshot,
    delivery_quote_id, merchandise_subtotal_amount, shipping_amount,
    buyer_protection_fee_amount, seller_commission_amount,
    platform_shipping_share_amount, seller_shipping_share_amount,
    buyer_total_amount, seller_proceeds_amount, seller_transfer_release_amount,
    seller_reserve_liability_amount, platform_retained_amount,
    estimated_stripe_cost_amount, estimated_carrier_cost_amount,
    platform_risk_reserve_contribution_amount, configured_minimum_margin_amount,
    expected_platform_margin_amount, currency, financial_terms_hash,
    pricing_locked_at, pay_by_at, financial_revision
) values (
    :order_42_id, :fee_id, :fee_version, '{}', :protection_id, :protection_version,
    '{}', :risk_id, :risk_version, '{}', 'quote-42', 10000, 450, 620, 1000,
    450, 0, 11070, 9000, 8500, 500, 2070, 100, 200, 50, 100, 1720,
    'eur', repeat('a', 64), '2026-07-17 12:01+00', '2026-07-17 12:31+00', 2
);
insert into commerce.order_fulfillments (
    order_id, status, seller_handoff_deadline, scan_grace_deadline,
    version, created_at, updated_at
) values (
    :order_42_id, 'awaiting_shipment', '2026-07-20 12:00+00',
    '2026-07-22 12:00+00', 4, '2026-07-17 12:01+00', '2026-07-17 12:02+00'
);
insert into commerce.order_settlements (
    order_id, status, authorized_seller_amount, total_transferred_amount,
    total_reversed_amount, total_refunded_amount,
    seller_reserve_liability_remaining_amount, platform_gross_remainder_amount,
    version, created_at, updated_at
) values (
    :order_42_id, 'held', 9000, 0, 0, 0, 500, 2070, 2,
    '2026-07-17 12:01+00', '2026-07-17 12:03+00'
);
insert into commerce.order_payment_attempts (
    order_id, provider_payment_id, provider_payment_intent_id,
    client_reference_id, status, amount, currency, financial_terms_hash,
    succeeded_at, created_at, updated_at
) values (
    :order_42_id, 9400000000420, 'pi_order_read_42', 'client-order-read-42',
    'succeeded', 11070, 'eur', repeat('a', 64), '2026-07-17 12:04+00',
    '2026-07-17 12:02+00', '2026-07-17 12:04+00'
);
