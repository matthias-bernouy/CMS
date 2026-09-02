insert into commerce.sellers (kind, cms_user_id, slug, display_name)
values
    ('user', '  seller-context-owner  ', 'seller-context-owner', 'Seller context owner'),
    ('user', 'seller-context-other', 'seller-context-other', 'Seller context other'),
    ('merchant', null, 'seller-context-merchant', 'Seller context merchant');

insert into commerce.products (slug, title, status, visibility)
values
    ('seller-context-product-a', 'Seller context product A', 'active', 'public'),
    ('seller-context-product-b', 'Seller context product B', 'active', 'public'),
    ('seller-context-product-c', 'Seller context product C', 'active', 'public'),
    ('seller-context-product-d', 'Seller context product D', 'active', 'public');

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, currency
)
select seller.id, product.id, spec.offer_slug, spec.offer_title, 'good', 'eur'
from (values
    ('seller-context-owner', 'seller-context-product-a', 'seller-context-offer-a', 'Seller context offer A'),
    ('seller-context-owner', 'seller-context-product-b', 'seller-context-offer-b', 'Seller context offer B'),
    ('seller-context-other', 'seller-context-product-c', 'seller-context-offer-c', 'Seller context offer C'),
    ('seller-context-merchant', 'seller-context-product-d', 'seller-context-offer-d', 'Seller context offer D')
) spec(seller_slug, product_slug, offer_slug, offer_title)
join commerce.sellers seller on seller.slug = spec.seller_slug
join commerce.products product on product.slug = spec.product_slug;

insert into commerce.checkout_groups (
    id, buyer_cms_user_id, idempotency_key, request_hash
) values
    ('20000000-0000-4000-8000-000000000001', 'seller-context-buyer', 'seller-context-order-a', repeat('a', 32)),
    ('20000000-0000-4000-8000-000000000002', '  seller-context-buyer  ', 'seller-context-order-b', repeat('b', 32)),
    ('20000000-0000-4000-8000-000000000003', 'seller-context-buyer', 'seller-context-order-c', repeat('c', 32));

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
)
select spec.order_number, spec.checkout_group_id::uuid, seller.id,
    spec.buyer_cms_user_id, 'eur', 1000, 1000,
    spec.idempotency_key, spec.request_hash
from (values
    ('SELLER-CONTEXT-A', '20000000-0000-4000-8000-000000000001', 'seller-context-owner', 'seller-context-buyer', 'seller-context-order-a', repeat('a', 32)),
    ('SELLER-CONTEXT-B', '20000000-0000-4000-8000-000000000002', 'seller-context-owner', '  seller-context-buyer  ', 'seller-context-order-b', repeat('b', 32)),
    ('SELLER-CONTEXT-C', '20000000-0000-4000-8000-000000000003', 'seller-context-merchant', 'seller-context-buyer', 'seller-context-order-c', repeat('c', 32))
) spec(order_number, checkout_group_id, seller_slug, buyer_cms_user_id, idempotency_key, request_hash)
join commerce.sellers seller on seller.slug = spec.seller_slug;
