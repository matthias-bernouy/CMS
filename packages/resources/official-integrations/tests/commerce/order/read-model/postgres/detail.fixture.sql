insert into commerce.products (slug, title, status, visibility)
values ('order-detail-baseline-product', 'Order detail baseline product', 'active', 'public')
returning id as detail_product_id \gset

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability, quantity_available
) values (
    :seller_17_id, :detail_product_id, 'order-detail-baseline-offer',
    'Order detail baseline offer', 'good', 'active', 'approved', 500,
    'eur', 'available', 3
) returning id as detail_offer_id \gset

insert into commerce.order_lines (
    order_id, seller_id, offer_id, product_id, title, quantity,
    unit_amount, total_amount, product_snapshot, offer_snapshot, seller_snapshot
) values
    (:order_42_id, :seller_17_id, :detail_offer_id, :detail_product_id,
        'Baseline line A', 1, 500, 500, '{"title":"Product A"}',
        '{"slug":"offer-a"}', '{"displayName":"Seller 17"}'),
    (:order_42_id, :seller_17_id, :detail_offer_id, :detail_product_id,
        'Baseline line B', 2, 500, 1000, '{"title":"Product B"}',
        '{"slug":"offer-b"}', '{"displayName":"Seller 17"}');

update commerce.orders set metadata = jsonb_build_object(
    'detailPublicA', 305, 'detailPublicB', 'Ring twice',
    'detailPrivate', 'internal', 'detailDisabled', 'legacy'
) where id = :order_42_id;

insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, unit, public_readable, position, enabled
) values
    ('order', 'detailPublicB', 'Public B', 'string', null, true, 5, true),
    ('order', 'detailPublicA', 'Public A', 'number', 'g', true, 5, true),
    ('order', 'detailPrivate', 'Private', 'string', null, false, 1, true),
    ('order', 'detailDisabled', 'Disabled', 'string', null, true, 1, false);

insert into commerce.marketplace_claims (
    public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, seller_response_by_at, created_at, updated_at
) values
    ('20000000-0000-4000-8000-000000000087', :order_42_id,
        'order-read-buyer-a', :seller_17_id, 'damaged', 'resolved_seller',
        'Older claim', '2026-07-19 12:00+00', '2026-07-18 12:00+00', '2026-07-18 12:00+00'),
    ('20000000-0000-4000-8000-000000000088', :order_42_id,
        'order-read-buyer-a', :seller_17_id, 'not_as_described', 'open',
        'Latest claim', '2026-07-20 12:00+00', '2026-07-19 12:00+00', '2026-07-19 12:00+00');
