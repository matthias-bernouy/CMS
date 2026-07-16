insert into commerce.sellers (kind, cms_user_id, slug, display_name)
values
    ('user', 'seller-read-model-user', 'seller-read-model-user', 'Seller read model'),
    ('user', 'seller-read-model-other', 'seller-read-model-other', 'Other seller');

insert into commerce.products (slug, title, status, visibility)
values
    ('seller-read-model-product', 'Seller read model product', 'active', 'public'),
    ('seller-read-model-product-two', 'Seller read model product two', 'active', 'public');

insert into commerce.product_variants (product_id, sku, title, status)
select id, 'SELLER-READ-MODEL-V1', 'Seller read model V1', 'active'
from commerce.products where slug = 'seller-read-model-product';

insert into commerce.offer_workflow_states (code, label, phase, position, enabled, terminal)
values ('seller_read_model_review', 'Custom review', 'admin_review', 25, false, false);

insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, description, condition_code,
    publication_status, workflow_state, accepted_price_amount, currency,
    availability, quantity_available, metadata, version, created_at, updated_at
)
select seller.id, product.id, variant.id, input.slug, input.title, input.description,
       input.condition_code, input.publication_status, input.workflow_state,
       input.amount, 'eur', input.availability, input.quantity,
       input.metadata, input.version, input.created_at, input.updated_at
from commerce.sellers seller
cross join commerce.products product
cross join (values
    ('seller-read-review-old', 'Review old', 'Used racket', 'good', 'draft',
        'pending_review', 11000, 'unavailable', 0, '{}'::jsonb, 2,
        '2026-07-01 10:00:00+00'::timestamptz, '2026-07-03 10:00:00+00'::timestamptz),
    ('seller-read-review-new', 'Review new', null, 'good', 'draft',
        'pending_review', 13000, 'available', 1, '{"privateNote":"kept"}'::jsonb, 3,
        '2026-07-02 10:00:00+00'::timestamptz, '2026-07-04 10:00:00+00'::timestamptz),
    ('seller-read-custom-review', 'Custom review', null, 'poor', 'draft',
        'seller_read_model_review', 14000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-03 10:00:00+00'::timestamptz, '2026-07-05 10:00:00+00'::timestamptz),
    ('seller-read-online', 'Online', null, 'good', 'active',
        'approved', 15000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-04 10:00:00+00'::timestamptz, '2026-07-06 10:00:00+00'::timestamptz),
    ('seller-read-paused', 'Paused', null, 'good', 'paused',
        'approved', 16000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-05 10:00:00+00'::timestamptz, '2026-07-07 10:00:00+00'::timestamptz),
    ('seller-read-archive-pub', 'Archived publication', null, 'good', 'archived',
        'approved', 17000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-06 10:00:00+00'::timestamptz, '2026-07-08 10:00:00+00'::timestamptz),
    ('seller-read-archive-state', 'Archived workflow', null, 'good', 'draft',
        'archived', 18000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-07 10:00:00+00'::timestamptz, '2026-07-09 10:00:00+00'::timestamptz),
    ('seller-read-rejected', 'Rejected', null, 'good', 'draft',
        'rejected', 19000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-08 10:00:00+00'::timestamptz, '2026-07-10 10:00:00+00'::timestamptz),
    ('seller-read-action', 'Action required', null, 'good', 'draft',
        'changes_requested', 20000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-09 10:00:00+00'::timestamptz, '2026-07-11 10:00:00+00'::timestamptz),
    ('seller-read-draft', 'Draft', null, 'good', 'draft',
        'draft', 21000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-10 10:00:00+00'::timestamptz, '2026-07-12 10:00:00+00'::timestamptz),
    ('seller-read-ready', 'Ready', null, 'good', 'draft',
        'approved', 22000, 'available', 1, '{}'::jsonb, 1,
        '2026-07-11 10:00:00+00'::timestamptz, '2026-07-13 10:00:00+00'::timestamptz)
) input(slug, title, description, condition_code, publication_status, workflow_state,
        amount, availability, quantity, metadata, version, created_at, updated_at)
left join commerce.product_variants variant
  on variant.product_id = product.id
 and variant.sku = 'SELLER-READ-MODEL-V1'
 and input.slug = 'seller-read-review-old'
where seller.cms_user_id = 'seller-read-model-user'
  and product.slug = 'seller-read-model-product';

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability, quantity_available
)
select seller.id, product.id, 'seller-read-other-offer', 'Other offer', 'good',
       'draft', 'pending_review', 23000, 'eur', 'available', 1
from commerce.sellers seller cross join commerce.products product
where seller.cms_user_id = 'seller-read-model-other'
  and product.slug = 'seller-read-model-product-two';

insert into commerce.media (storage_bucket, storage_path, mime_type, file_size, original_filename)
select 'commerce-media', 'seller-read-model/' || value || '.jpg', 'image/jpeg', 100, value || '.jpg'
from unnest(array['12', '13', '14', '15']) value;

insert into commerce.offer_media (offer_id, media_id, sort_order, is_main)
select offer.id, media.id, link.sort_order, link.is_main
from (values
    ('seller-read-review-old', '12', 1, false), ('seller-read-review-old', '13', 2, true),
    ('seller-read-review-new', '14', 1, false), ('seller-read-review-new', '15', 1, false)
) link(offer_slug, media_key, sort_order, is_main)
join commerce.offers offer on offer.slug = link.offer_slug
join commerce.media media on media.storage_path = 'seller-read-model/' || link.media_key || '.jpg';

insert into commerce.offer_price_proposals (
    offer_id, amount, currency, status, proposed_by, decided_by, decided_at, created_at
)
select offer.id, proposal.amount, 'eur', proposal.status, 'admin',
       proposal.decided_by, proposal.decided_at, proposal.created_at
from commerce.offers offer
cross join (values
    (11000::bigint, 'accepted', 'admin', '2026-07-05 10:00:00+00'::timestamptz,
        '2026-07-06 10:00:00+00'::timestamptz),
    (12000::bigint, 'pending', null, null, '2026-07-06 10:00:00+00'::timestamptz)
) proposal(amount, status, decided_by, decided_at, created_at)
where offer.slug = 'seller-read-review-old';
