\ir ../../../../order/read-model/postgres/baseline.fixture.sql

insert into commerce.marketplace_claims (
    id, public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, seller_response_by_at
) values (
    9800000000007, '40000000-0000-4000-8000-000000000007', :order_42_id,
    'order-read-buyer-a', :seller_17_id, 'not_as_described', 'under_review',
    'Active evidence claim.', '2026-07-20 08:00+00'
), (
    9800000000008, '40000000-0000-4000-8000-000000000008', :order_43_id,
    'order-read-buyer-b', :seller_18_id, 'other', 'resolved_buyer',
    'Resolved evidence claim.', '2026-07-20 08:00+00'
);

insert into commerce.marketplace_claim_evidence (
    id, claim_id, submitted_by_kind, submitted_by, storage_bucket, storage_path,
    mime_type, file_size, original_filename, sha256, description, metadata, created_at
) values (
    9800000000033, 9800000000007, 'seller', 'order-read-seller-17',
    'commerce-claim-evidence',
    'claims/40000000-0000-4000-8000-000000000007/seller/adverse-proof.pdf',
    'application/pdf', 34, 'adverse-proof.pdf', repeat('a', 64), null,
    '{"upload":"edge_multipart_v1"}', '2026-07-17 11:00+00'
), (
    9800000000034, 9800000000008, 'buyer', 'order-read-buyer-b',
    'commerce-claim-evidence',
    'claims/40000000-0000-4000-8000-000000000008/buyer/resolved-proof.png',
    'image/png', 128, 'resolved-proof.png', repeat('b', 64), 'Resolved proof',
    '{}', '2026-07-17 12:00+00'
);
