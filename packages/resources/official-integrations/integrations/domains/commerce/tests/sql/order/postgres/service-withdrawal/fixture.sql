insert into commerce.sellers (
    kind, cms_user_id, slug, display_name,
    verification_status, verified_at, verified_by
) values (
    'user', 'service-withdrawal-seller', 'service-withdrawal-seller',
    'Service withdrawal seller', 'verified', now(), 'contract-admin'
);

insert into commerce.checkout_groups (
    id, buyer_cms_user_id, idempotency_key, request_hash
) values (
    '019c0000-0000-7000-8000-000000000001',
    'service-withdrawal-buyer',
    'service-withdrawal-order',
    md5('service-withdrawal-order')
);

insert into commerce.orders (
    id, public_id, order_number, checkout_group_id, seller_id,
    buyer_cms_user_id, status, currency, subtotal_amount, total_amount,
    idempotency_key, request_hash
) values (
    4201,
    '019c0000-0000-7000-8000-000000000002',
    'SERVICE-WITHDRAWAL-4201',
    '019c0000-0000-7000-8000-000000000001',
    (select id from commerce.sellers where slug = 'service-withdrawal-seller'),
    'service-withdrawal-buyer',
    'active',
    'eur',
    10000,
    10000,
    'service-withdrawal-order',
    md5('service-withdrawal-order')
);

insert into commerce.order_payment_attempts (
    id, order_id, client_reference_id, status, amount, currency,
    financial_terms_hash
) values (
    4301, 4201, 'service-withdrawal-payment', 'created', 10000, 'eur',
    repeat('f', 64)
);

insert into commerce.buyer_legal_documents (
    document_key, enabled, configured_by
) values (
    'marketplace_terms', true, 'contract-admin'
);

insert into commerce.buyer_legal_document_versions (
    id, document_key, label, consent_text, checkout_contexts,
    cms_page_id, page_path, page_title, page_content,
    content_hash, materialization_hash, materialized_by
) values (
    '019c0000-0000-7000-8000-000000000003',
    'marketplace_terms',
    'Marketplace terms',
    'I accept the marketplace terms.',
    array['buyer_checkout'],
    'legal-marketplace-terms',
    '/marketplace-terms',
    'Marketplace terms',
    to_jsonb('Immutable marketplace terms'::text),
    repeat('a', 64),
    repeat('b', 64),
    'contract-admin'
);

update commerce.buyer_legal_documents
set current_version_id = '019c0000-0000-7000-8000-000000000003'
where document_key = 'marketplace_terms';

insert into commerce.order_buyer_legal_acceptances (
    order_id, checkout_group_id, payment_attempt_id, buyer_cms_user_id,
    document_key, document_version_id, content_hash, correlation_id
) values (
    4201,
    '019c0000-0000-7000-8000-000000000001',
    4301,
    'service-withdrawal-buyer',
    'marketplace_terms',
    '019c0000-0000-7000-8000-000000000003',
    repeat('a', 64),
    '019c0000-0000-7000-8000-000000000004'
);
