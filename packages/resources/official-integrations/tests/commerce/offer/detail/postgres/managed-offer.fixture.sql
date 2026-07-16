insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, public_readable, enabled
)
values
    ('product', 'public_spec', 'Public specification', 'string', true, true),
    ('product', 'private_cost', 'Private cost', 'number', false, true);

insert into commerce.brands (slug, name, status)
values ('managed-offer-brand', 'Managed offer brand', 'active');

insert into commerce.brands (id, slug, name, status)
values (0, 'managed-offer-zero-brand', 'Managed zero brand', 'active');

insert into commerce.categories (slug, full_slug, label, status, position)
values ('managed-offer-category', 'managed-offer-category', 'Managed offer category', 'active', 17);

insert into commerce.sellers (kind, cms_user_id, slug, display_name, verification_status)
values
    ('user', 'managed-offer-owner', 'managed-offer-owner', 'Managed owner', 'pending'),
    ('user', 'managed-offer-other', 'managed-offer-other', 'Managed other', 'pending');

insert into commerce.products (slug, title, brand_id, status, visibility, metadata)
select 'managed-offer-product', 'Managed product', brand.id, 'active', 'public',
       '{"public_spec":"24MP","private_cost":9000}'::jsonb
from commerce.brands brand
where brand.slug = 'managed-offer-brand';

insert into commerce.products (slug, title, status, visibility, metadata)
values ('managed-offer-plain-product', 'Plain product', 'active', 'public', '{}');

insert into commerce.products (slug, title, brand_id, status, visibility, metadata)
values ('managed-offer-zero-product', 'Zero product', 0, 'active', 'public', '{}');

insert into commerce.product_categories (product_id, category_id, is_primary, position)
select product.id, category.id, true, 3
from commerce.products product
cross join commerce.categories category
where product.slug = 'managed-offer-product'
  and category.full_slug = 'managed-offer-category';

insert into commerce.product_variants (product_id, sku, title, status)
select product.id, 'MANAGED-OFFER-V1', 'Body only', 'active'
from commerce.products product
where product.slug = 'managed-offer-product';

insert into commerce.product_variants (id, product_id, sku, title, status)
select 0, product.id, 'MANAGED-OFFER-ZERO', 'Zero variant', 'active'
from commerce.products product
where product.slug = 'managed-offer-zero-product';

insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, description, condition_code,
    publication_status, workflow_state, accepted_price_amount, currency,
    availability, quantity_available, inventory_revision, metadata, version,
    created_at, updated_at
)
select seller.id, product.id, variant.id, 'managed-offer-full', 'Managed full offer', null,
       'good', 'draft', 'pending_review', 12500, 'eur', 'available', null, 9,
       '{"privateSellerNote":"visible","internal_note":"keep-snake-case"}'::jsonb, 4,
       '2026-07-01 10:00:00+00', '2026-07-04 10:00:00+00'
from commerce.sellers seller
cross join commerce.products product
join commerce.product_variants variant on variant.product_id = product.id
where seller.cms_user_id = 'managed-offer-owner'
  and product.slug = 'managed-offer-product';

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability, metadata
)
select seller.id, product.id, 'managed-offer-plain', 'Managed plain offer', 'good',
       'draft', 'draft', null, 'eur', 'available', '{}'
from commerce.sellers seller
cross join commerce.products product
where seller.cms_user_id = 'managed-offer-other'
  and product.slug = 'managed-offer-plain-product';

insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, condition_code,
    publication_status, workflow_state, currency, availability, metadata
)
select seller.id, product.id, 0, 'managed-offer-zero', 'Managed zero offer', 'good',
       'draft', 'draft', 'eur', 'available', '{}'
from commerce.sellers seller
cross join commerce.products product
where seller.cms_user_id = 'managed-offer-owner'
  and product.slug = 'managed-offer-zero-product';

insert into commerce.offer_price_rules (
    offer_id, minimum_amount, maximum_amount, currency, configured_by, version,
    created_at, updated_at
)
select offer.id, 11000, 15000, 'eur', 'admin-1', 3,
       '2026-07-02 10:00:00+00', '2026-07-03 10:00:00+00'
from commerce.offers offer
where offer.slug = 'managed-offer-full';

insert into commerce.offer_price_proposals (
    offer_id, amount, currency, status, proposed_by, created_at
)
select offer.id, 10000 + sequence.value, 'eur', 'withdrawn',
       'actor-' || sequence.value,
       '2026-07-03 10:00:00+00'::timestamptz + sequence.value * interval '1 minute'
from commerce.offers offer
cross join generate_series(1, 21) sequence(value)
where offer.slug = 'managed-offer-full';

insert into commerce.media (
    storage_bucket, storage_path, mime_type, file_size, original_filename, alt,
    created_at, updated_at
)
select 'commerce-media', 'managed-offer/' || media.key || '.jpg', 'image/jpeg',
       media.file_size, media.key || '.jpg', media.alt,
       '2026-07-01 11:00:00+00', '2026-07-02 11:00:00+00'
from (values
    ('first', 1100::bigint, null::text),
    ('main', 1200::bigint, 'Main'),
    ('last', 1300::bigint, 'Last')
) media(key, file_size, alt);

insert into commerce.offer_media (offer_id, media_id, sort_order, is_main)
select offer.id, media.id, link.sort_order, link.is_main
from (values
    ('last', 30, false),
    ('main', 20, true),
    ('first', 10, false)
) link(media_key, sort_order, is_main)
join commerce.offers offer on offer.slug = 'managed-offer-full'
join commerce.media media
  on media.storage_path = 'managed-offer/' || link.media_key || '.jpg';
