insert into commerce.marketplace_claims (
    id, public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, resolution_outcome, seller_response_by_at, return_ship_by_at,
    return_delivery_status, version, created_at, updated_at
) values (
    9800000000001, '38000000-0000-4000-8000-000000000001', :order_42_id,
    'order-read-buyer-a', :seller_17_id, 'return_requested', 'return_required',
    'Complete return authorization.', 'return_required', '2026-07-18 08:00+00',
    '2099-07-25 08:00+00', 'awaiting_carrier', 3,
    '2026-07-17 08:00+00', '2026-07-18 08:00+00'
);

insert into commerce.marketplace_claims (
    id, public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, resolution_outcome, seller_response_by_at, return_ship_by_at,
    version, created_at, updated_at
) values (
    9800000000002, '38000000-0000-4000-8000-000000000002', :order_41_id,
    'claim-return-buyer-shadow', :seller_17_id, 'return_requested', 'return_required',
    'Return without financial terms.', 'return_required', '2026-07-18 08:00+00',
    null, 4, '2026-07-17 08:00+00', '2026-07-18 08:00+00'
);

update commerce.sellers
set cms_user_id = E'\t'
where id = :seller_18_id;

update commerce.orders
set seller_id = :seller_17_id
where id = :order_43_id;

insert into commerce.marketplace_claims (
    id, public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, resolution_outcome, seller_response_by_at, return_ship_by_at,
    version, created_at, updated_at
) values (
    9800000000003, '38000000-0000-4000-8000-000000000003', :order_43_id,
    'order-read-buyer-b', :seller_18_id, 'return_requested', 'return_required',
    'Return with a whitespace seller identity.', 'return_required',
    '2026-07-18 08:00+00', '2099-07-25 08:00+00', 5,
    '2026-07-17 08:00+00', '2026-07-18 08:00+00'
);
