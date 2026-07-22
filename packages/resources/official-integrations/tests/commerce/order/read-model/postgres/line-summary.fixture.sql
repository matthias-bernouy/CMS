insert into commerce.products (slug, title, status, visibility)
values ('order-list-summary-product', 'Order list summary product', 'active', 'public')
returning id as list_summary_product_id \gset

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability, quantity_available
) values (
    :seller_17_id, :list_summary_product_id, 'order-list-summary-offer',
    'Order list summary offer', 'good', 'active', 'approved', 500,
    'eur', 'available', 3
) returning id as list_summary_offer_id \gset

insert into commerce.order_lines (
    order_id, seller_id, offer_id, product_id, title, quantity,
    unit_amount, total_amount, product_snapshot, offer_snapshot, seller_snapshot
) values
    (:order_42_id, :seller_17_id, :list_summary_offer_id, :list_summary_product_id,
        'Baseline line A', 1, 500, 500, '{"title":"Product A"}',
        '{"slug":"offer-a"}', '{"displayName":"Seller 17"}'),
    (:order_42_id, :seller_17_id, :list_summary_offer_id, :list_summary_product_id,
        'Baseline line B', 2, 500, 1000, '{"title":"Product B"}',
        '{"slug":"offer-b"}', '{"displayName":"Seller 17"}');
