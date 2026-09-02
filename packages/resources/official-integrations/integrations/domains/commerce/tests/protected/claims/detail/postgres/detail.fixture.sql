insert into commerce.marketplace_claims (
    id, public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, buyer_requested_amount, resolution_outcome, decision_reason,
    seller_response_by_at, return_ship_by_at, return_delivery_status,
    return_provider_reference, return_carrier_accepted_at, version, created_at, updated_at
) values (
    9700000000007, '30000000-0000-4000-8000-000000000007', :order_42_id,
    'order-read-buyer-a', :seller_17_id, 'not_as_described', 'return_required',
    'The received item differs from the listing.', 10000, 'return_required',
    'Return the item before resolution.', '2026-07-18 08:00+00',
    '2026-07-25 08:00+00', 'carrier_accepted', 'return-42',
    '2026-07-20 08:00+00', 3, '2026-07-17 08:00+00', '2026-07-20 08:00+00'
);

insert into commerce.marketplace_claim_events (
    id, claim_id, event_type, actor_kind, actor_id, message, data, created_at
) values
    (9700000000072, 9700000000007, 'return_required', 'admin', 'admin-3',
        'Return authorized', '{"return_flow":true}', '2026-07-17 08:00+00'),
    (9700000000071, 9700000000007, 'opened', 'buyer', 'order-read-buyer-a', null,
        '{"internal_key":"kept_opaque"}', '2026-07-17 08:00+00');

insert into commerce.marketplace_claim_evidence (
    id, claim_id, submitted_by_kind, submitted_by, storage_bucket, storage_path,
    mime_type, file_size, original_filename, sha256, description, metadata, created_at
) values
    (9700000000082, 9700000000007, 'seller', 'order-read-seller-17',
        'commerce-claim-evidence', 'claims/private/seller.png', 'image/png',
        2048, 'seller-proof.png', repeat('b', 64), 'Packing photograph',
        '{"upload_kind":"seller"}', '2026-07-17 09:00+00'),
    (9700000000081, 9700000000007, 'buyer', 'order-read-buyer-a',
        'commerce-claim-evidence', 'claims/private/buyer.pdf', 'application/pdf',
        1024, 'buyer-proof.pdf', repeat('a', 64), null,
        '{"upload_kind":"buyer"}', '2026-07-17 09:00+00');

insert into commerce.marketplace_claim_return_events (
    id, claim_id, provider_event_id, provider_reference, normalized_status,
    occurred_at, provider_evidence, created_at
) values
    (9700000000092, 9700000000007, 'return:event:2', 'return-42',
        'in_transit', '2026-07-20 08:00+00', '{"private":"carrier"}',
        '2026-07-20 08:01+00'),
    (9700000000091, 9700000000007, 'return:event:1', 'return-42',
        'carrier_accepted', '2026-07-20 08:00+00', '{"private":"carrier"}',
        '2026-07-20 08:01+00');
