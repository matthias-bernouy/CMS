begin;
\ir ../fixture.sql
set local role service_role;
select commerce_product_matrix_test.seed_product('lifecycle');
insert into commerce.product_variants (
    product_id, sku, title, status, position, generated_from_axes
)
select product_id, 'MATRIX-MANUAL', 'Manual variant', 'active', 10, false
from commerce_product_matrix_test.products where label = 'lifecycle';
insert into commerce.sellers (
    kind, slug, display_name, verification_status, verified_at, verified_by
) values (
    'merchant', 'matrix-contract-seller', 'Matrix contract seller',
    'verified', now(), 'matrix-contract'
);
insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, condition_code,
    publication_status, workflow_state, accepted_price_amount, currency
)
select seller.id, seeded.product_id, variant.id,
    'matrix-offer-' || variant_key, 'Matrix offer ' || variant_key, 'good',
    'active', 'approved', 1000, 'eur'
from commerce_product_matrix_test.products seeded
join commerce.sellers seller on seller.slug = 'matrix-contract-seller'
join lateral (values ('red-s'), ('red-l'), ('manual')) requested(variant_key) on true
join commerce.product_variants variant
  on variant.product_id = seeded.product_id
 and case requested.variant_key
     when 'manual' then not variant.generated_from_axes
     else variant.combination_key = requested.variant_key
 end
where seeded.label = 'lifecycle';
commit;
