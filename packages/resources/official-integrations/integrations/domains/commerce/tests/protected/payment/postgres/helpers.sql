create schema commerce_buyer_legal_test;

create table commerce_buyer_legal_test.orders (
    label text primary key,
    order_id bigint not null,
    public_id uuid not null,
    checkout_group_id uuid not null,
    buyer_cms_user_id text not null,
    financial_terms_hash text not null
);

create table commerce_buyer_legal_test.state (
    key text primary key,
    value jsonb not null
);

create function commerce_buyer_legal_test.assert_true(
    p_condition boolean,
    p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if not coalesce(p_condition, false) then
        raise exception 'buyer legal contract: %', p_message;
    end if;
end;
$$;

create function commerce_buyer_legal_test.seed_order(
    p_label text,
    p_negotiated boolean default false
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_buyer_id text := 'legal-buyer-' || p_label;
    v_checkout_group_id uuid;
    v_order commerce.orders%rowtype;
    v_terms jsonb;
    v_seller_id bigint;
    v_product_id bigint;
    v_offer_id bigint;
begin
    select id into strict v_seller_id
    from commerce.sellers
    where slug = 'buyer-legal-contract-seller';

    insert into commerce.checkout_groups (
        buyer_cms_user_id, idempotency_key, request_hash
    ) values (
        v_buyer_id,
        'buyer-legal-order-' || p_label,
        pg_catalog.md5('buyer-legal-order-' || p_label)
    ) returning id into v_checkout_group_id;

    insert into commerce.orders (
        order_number, checkout_group_id, seller_id, buyer_cms_user_id,
        currency, subtotal_amount, total_amount, idempotency_key, request_hash
    ) values (
        'BUYER-LEGAL-' || pg_catalog.upper(p_label),
        v_checkout_group_id,
        v_seller_id,
        v_buyer_id,
        'eur',
        10000,
        10000,
        'buyer-legal-order-' || p_label,
        pg_catalog.md5('buyer-legal-order-' || p_label)
    ) returning * into v_order;

    if p_negotiated then
        insert into commerce.products (slug, title, status, visibility)
        values (
            'buyer-legal-product-' || p_label,
            'Buyer legal product ' || p_label,
            'active',
            'public'
        ) returning id into v_product_id;

        insert into commerce.offers (
            seller_id, product_id, slug, title, condition_code,
            publication_status, workflow_state, accepted_price_amount,
            currency, availability, quantity_available, inventory_revision
        ) values (
            v_seller_id,
            v_product_id,
            'buyer-legal-offer-' || p_label,
            'Buyer legal offer ' || p_label,
            'very_good',
            'active',
            'approved',
            10000,
            'eur',
            'available',
            1,
            1
        ) returning id into v_offer_id;

        insert into commerce.price_agreements (
            authority_key, authority_reference, authority_version,
            offer_id, seller_id, buyer_cms_user_id, unit_amount,
            currency, quantity, status, expires_at, order_id, consumed_at
        ) values (
            'buyer-legal-contract',
            'agreement-' || p_label,
            1,
            v_offer_id,
            v_seller_id,
            v_buyer_id,
            10000,
            'eur',
            1,
            'consumed',
            now() + interval '1 day',
            v_order.id,
            now()
        );
    end if;

    v_terms := commerce.lock_order_financial_terms(
        v_order.public_id,
        v_buyer_id,
        'buyer-legal-quote-' || p_label,
        0,
        'eur',
        v_order.version,
        'buyer-legal-contract'
    );

    insert into commerce_buyer_legal_test.orders (
        label, order_id, public_id, checkout_group_id,
        buyer_cms_user_id, financial_terms_hash
    ) values (
        p_label,
        v_order.id,
        v_order.public_id,
        v_checkout_group_id,
        v_buyer_id,
        v_terms->>'financial_terms_hash'
    );
    return v_order.id;
end;
$$;

create function commerce_buyer_legal_test.receipts(p_order_id bigint, p_required boolean default true)
returns jsonb language sql security invoker set search_path = '' as $$
    select jsonb_agg(jsonb_build_object(
        'schemaVersion', 1, 'required', p_required, 'contextKey', context.key,
        'operationKey', scope.value->>'operationKey', 'cmsUserId', scope.value->>'buyerCmsUserId',
        'acceptanceId', '23484f33-28d7-4b47-a0bf-48870a4d80ba', 'acceptedAt', now(),
        'metadata', jsonb_build_object('orderId', p_order_id, 'orderPublicId', scope.value->>'orderPublicId',
            'checkoutGroupId', scope.value->>'checkoutGroupId', 'paymentProvider', 'stripe'),
        'documents', case when p_required then jsonb_build_array(jsonb_build_object(
            'documentKey', 'terms', 'versionId', repeat('a',64), 'contentHash', repeat('b',64))) else '[]'::jsonb end
    ) order by context.key)
    from commerce.orders order_row
    cross join lateral (select commerce.get_buyer_consent_context(order_row.id, order_row.buyer_cms_user_id, 'stripe') value) scope
    cross join lateral jsonb_array_elements_text(scope.value->'contexts') context(key)
    where order_row.id = p_order_id;
$$;

grant usage on schema commerce_buyer_legal_test to service_role;
grant select, insert, update on all tables in schema commerce_buyer_legal_test to service_role;
grant execute on all functions in schema commerce_buyer_legal_test to service_role;
