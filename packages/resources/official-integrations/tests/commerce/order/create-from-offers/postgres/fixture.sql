insert into commerce.sellers (
    kind, cms_user_id, slug, display_name, verification_status,
    verified_at, verified_by
) values
    ('user', 'order-create-seller-user', 'order-create-seller',
        'Order Create Seller', 'verified', now(), 'order-create-admin'),
    ('user', 'order-create-other-seller-user', 'order-create-other-seller',
        'Order Create Other Seller', 'verified', now(), 'order-create-admin');

insert into commerce.products (slug, title, status, visibility)
values
    ('order-create-single-product', 'Single Product', 'active', 'public'),
    ('order-create-partial-product', 'Partial Product', 'active', 'public'),
    ('order-create-exact-product', 'Exact Product', 'active', 'public'),
    ('order-create-unlimited-product', 'Unlimited Product', 'active', 'public'),
    ('order-create-error-a-product', 'Error A Product', 'active', 'public'),
    ('order-create-error-b-product', 'Error B Product', 'active', 'public'),
    ('order-create-other-seller-product', 'Other Seller Product', 'active', 'public'),
    ('order-create-usd-product', 'USD Product', 'active', 'public'),
    ('order-create-idempotency-a-product', 'Idempotency A', 'active', 'public'),
    ('order-create-idempotency-b-product', 'Idempotency B', 'active', 'public'),
    ('order-create-concurrency-stock-product', 'Concurrency Stock', 'active', 'public'),
    ('order-create-concurrency-low-product', 'Concurrency Low', 'active', 'public'),
    ('order-create-concurrency-high-product', 'Concurrency High', 'active', 'public'),
    ('order-create-concurrency-idem-product', 'Concurrency Idempotency', 'active', 'public');

insert into commerce.products (slug, title, status, visibility)
select 'order-create-bulk-product-' || lpad(number::text, 3, '0'),
       'Bulk Product ' || lpad(number::text, 3, '0'), 'active', 'public'
from generate_series(1, 100) number;

insert into commerce.product_variants (
    product_id, sku, title, status, combination_key, generated_from_axes
)
select id, 'ORDER-CREATE-SINGLE-SKU', 'Medium Blue', 'active',
       'size=m&color=blue', true
from commerce.products where slug = 'order-create-single-product';

insert into commerce.product_variant_axes (product_id, key, label, position)
select id, axis.key, axis.label, axis.position
from commerce.products
cross join (values ('size', 'Size', 10), ('color', 'Color', 20))
    axis(key, label, position)
where slug = 'order-create-single-product';

insert into commerce.product_variant_axis_values (
    product_id, axis_id, key, label, value
)
select axis.product_id, axis.id, value.key, value.label, to_jsonb(value.label)
from commerce.product_variant_axes axis
join (values ('size', 'm', 'Medium'), ('color', 'blue', 'Blue'))
    value(axis_key, key, label) on value.axis_key = axis.key
join commerce.products product on product.id = axis.product_id
where product.slug = 'order-create-single-product';

insert into commerce.product_variant_selections (
    product_id, variant_id, axis_id, value_id
)
select variant.product_id, variant.id, axis.id, axis_value.id
from commerce.product_variants variant
join commerce.products product on product.id = variant.product_id
join commerce.product_variant_axes axis on axis.product_id = product.id
join commerce.product_variant_axis_values axis_value
  on axis_value.product_id = product.id and axis_value.axis_id = axis.id
where product.slug = 'order-create-single-product';

insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, condition_code,
    publication_status, workflow_state, accepted_price_amount, currency,
    availability, quantity_available, inventory_revision
)
select seller.id, product.id,
       case when spec.has_variant then variant.id else null end,
       spec.slug, spec.title, 'very_good', 'active', 'approved', spec.amount,
       spec.currency, spec.availability, spec.quantity_available, spec.revision
from (values
    (1, 'order-create-single', 'order-create-single-product', 'Single Offer', 12345, 'eur', 'available', 7, 11, true),
    (2, 'order-create-partial', 'order-create-partial-product', 'Partial Offer', 2100, 'eur', 'available', 5, 21, false),
    (3, 'order-create-exact', 'order-create-exact-product', 'Exact Offer', 2200, 'eur', 'available', 2, 22, false),
    (4, 'order-create-unlimited', 'order-create-unlimited-product', 'Unlimited Offer', 2300, 'eur', 'preorder', null, 23, false),
    (5, 'order-create-error-a', 'order-create-error-a-product', 'Unavailable Offer', 2400, 'eur', 'unavailable', 5, 24, false),
    (6, 'order-create-error-b', 'order-create-error-b-product', 'Insufficient Offer', 2500, 'eur', 'available', 1, 25, false),
    (7, 'order-create-usd', 'order-create-usd-product', 'USD Offer', 2600, 'usd', 'available', 5, 26, false),
    (8, 'order-create-idempotency-a', 'order-create-idempotency-a-product', 'Idempotency A', 2700, 'eur', 'available', 2, 27, false),
    (9, 'order-create-idempotency-b', 'order-create-idempotency-b-product', 'Idempotency B', 2800, 'eur', 'available', 2, 28, false),
    (10, 'order-create-concurrency-stock', 'order-create-concurrency-stock-product', 'Concurrency Stock', 2900, 'eur', 'available', 1, 29, false),
    (11, 'order-create-concurrency-low', 'order-create-concurrency-low-product', 'Concurrency Low', 3000, 'eur', 'available', 3, 30, false),
    (12, 'order-create-concurrency-high', 'order-create-concurrency-high-product', 'Concurrency High', 3100, 'eur', 'available', 3, 31, false),
    (13, 'order-create-concurrency-idem', 'order-create-concurrency-idem-product', 'Concurrency Idempotency', 3200, 'eur', 'available', 2, 32, false)
) spec(position, slug, product_slug, title, amount, currency, availability,
       quantity_available, revision, has_variant)
join commerce.sellers seller on seller.slug = 'order-create-seller'
join commerce.products product on product.slug = spec.product_slug
left join commerce.product_variants variant on variant.product_id = product.id
order by spec.position;

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability,
    quantity_available, inventory_revision
)
select seller.id, product.id,
       replace(product.slug, '-product-', '-'),
       replace(product.title, 'Product', 'Offer'), 'very_good', 'active',
       'approved', 1000 + right(product.slug, 3)::integer, 'eur', 'available',
       2, 100 + right(product.slug, 3)::integer
from commerce.products product
cross join commerce.sellers seller
where product.slug like 'order-create-bulk-product-%'
  and seller.slug = 'order-create-seller'
order by product.slug;

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability,
    quantity_available, inventory_revision
)
select seller.id, product.id, 'order-create-other-seller', 'Other Seller Offer',
       'very_good', 'active', 'approved', 2600, 'eur', 'available', 5, 33
from commerce.sellers seller
join commerce.products product on product.slug = 'order-create-other-seller-product'
where seller.slug = 'order-create-other-seller';

insert into commerce.offer_price_proposals (
    offer_id, amount, currency, status, proposed_by, decided_by, decided_at
)
select id, accepted_price_amount, currency, 'accepted',
       'order-create-seller-user', 'order-create-admin',
       '2026-07-21T08:00:00Z'::timestamptz
from commerce.offers where slug = 'order-create-single';
