select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'filter-read-model-root', 'label', 'Filter read model root'
))->>'id')::bigint root_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'parentId', :root_id,
    'slug', 'filter-read-model-child',
    'label', 'Filter read model child'
))->>'id')::bigint category_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'filter-read-model-outside', 'label', 'Filter read model outside'
))->>'id')::bigint outside_category_id \gset
update commerce.categories set status = 'inactive' where id = :root_id;

insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, options, unit, public_readable, enabled
) values
    (
        'product', 'filterReadModelWeight', 'Weight',
        'number', '[]', 'g', true, true
    ),
    (
        'product', 'filterReadModelTolerance', 'Tolerance',
        'number', '[]', null, true, true
    );
insert into commerce.category_custom_fields (
    category_id, field_key, required, filterable, position
) values
    (:root_id, 'filterReadModelWeight', false, true, 1),
    (:root_id, 'filterReadModelTolerance', false, true, 2);

update commerce.brands set status = 'inactive' where status = 'active';
insert into commerce.brands (id, slug, name, status) values
    (9100000000000, 'filter-alpha', 'Alpha', 'active'),
    (9100000000002, 'filter-beta-two', 'Beta', 'active'),
    (9100000000001, 'filter-beta-one', 'Beta', 'active'),
    (9100000000003, 'filter-inactive', 'Aardvark inactive', 'inactive'),
    (9100000000004, 'filter-archived', 'Aardvark archived', 'archived'),
    (9100000000005, 'filter-outside', 'Aardvark outside', 'active');
insert into commerce.brands (id, slug, name, status)
select
    9200000000000 + generated,
    'filter-generated-' || lpad(generated::text, 3, '0'),
    'Filter ' || lpad(generated::text, 3, '0'),
    'active'
from generate_series(1, 205) generated;

insert into commerce.products (slug, title, brand_id, status, visibility)
select
    'product-' || brand.slug,
    'Product ' || brand.name,
    brand.id,
    'active',
    'public'
from commerce.brands brand
where brand.slug like 'filter-%';

insert into commerce.product_categories (product_id, category_id, is_primary)
select
    product.id,
    case when brand.slug = 'filter-outside'
        then :outside_category_id
        else :category_id
    end,
    true
from commerce.products product
join commerce.brands brand on brand.id = product.brand_id
where product.slug like 'product-filter-%';

update commerce.products product
set
    status = case
        when brand.slug = 'filter-archived' then 'archived'
        else product.status
    end,
    visibility = case
        when brand.slug = 'filter-inactive' then 'hidden'
        else product.visibility
    end,
    metadata = case brand.slug
        when 'filter-alpha'
            then '{"filterReadModelWeight":300}'::jsonb
        when 'filter-beta-one'
            then '{"filterReadModelWeight":315}'::jsonb
        when 'filter-beta-two'
            then '{"filterReadModelWeight":"not-a-number"}'::jsonb
        when 'filter-inactive'
            then '{"filterReadModelWeight":1000}'::jsonb
        when 'filter-archived'
            then '{"filterReadModelWeight":-1000}'::jsonb
        when 'filter-outside'
            then '{"filterReadModelWeight":2000}'::jsonb
        else '{}'::jsonb
    end
from commerce.brands brand
where brand.id = product.brand_id
  and product.slug like 'product-filter-%';

insert into commerce.product_variants (
    product_id, title, status, metadata
)
select
    product.id,
    variant.title,
    variant.status,
    variant.metadata
from commerce.products product
cross join (
    values
        (
            'Active minimum',
            'active',
            '{"filterReadModelWeight":280.5,"filterReadModelTolerance":1.0000001}'::jsonb
        ),
        (
            'Active maximum',
            'active',
            '{"filterReadModelWeight":325.25,"filterReadModelTolerance":1.0000013}'::jsonb
        ),
        (
            'Active high precision',
            'active',
            '{"filterReadModelWeight":300.123456789}'::jsonb
        ),
        (
            'Draft excluded',
            'draft',
            '{"filterReadModelWeight":-2000}'::jsonb
        ),
        (
            'Archived excluded',
            'archived',
            '{"filterReadModelWeight":3000}'::jsonb
        )
) variant(title, status, metadata)
where product.slug = 'product-filter-alpha';

update commerce.products
set metadata = '{"filterReadModelWeight":null}'::jsonb
where slug = 'product-filter-generated-002';

insert into commerce.sellers (
    kind, slug, display_name, verification_status, verified_at, verified_by
) values (
    'external', 'filter-read-model-seller', 'Filter read model seller',
    'verified', now(), 'filter-read-model-test'
);
insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, condition_code,
    publication_status, workflow_state, accepted_price_amount,
    currency, availability, quantity_available
)
select
    seller.id, product.id, variant.id, fixture.offer_slug,
    fixture.title, 'good', 'active', 'approved', 10000,
    'eur', 'available', 1
from (
    values
        (
            'filter-range-present', 'Present numeric metadata',
            'product-filter-alpha', 'Active minimum'
        ),
        (
            'filter-range-missing', 'Missing numeric metadata',
            'product-filter-generated-001', null
        ),
        (
            'filter-range-null', 'Null numeric metadata',
            'product-filter-generated-002', null
        )
) fixture(offer_slug, title, product_slug, variant_title)
join commerce.sellers seller
  on seller.slug = 'filter-read-model-seller'
join commerce.products product
  on product.slug = fixture.product_slug
left join commerce.product_variants variant
  on variant.product_id = product.id
 and variant.title = fixture.variant_title;
