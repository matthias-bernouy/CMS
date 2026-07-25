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

create function commerce_buyer_legal_test.verified_snapshot(
    p_version_id uuid,
    p_content text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_version commerce.buyer_legal_document_versions%rowtype;
    v_content text;
    v_hash text;
begin
    select * into strict v_version
    from commerce.buyer_legal_document_versions
    where id = p_version_id;
    v_content := coalesce(p_content, v_version.page_content #>> '{}');
    v_hash := commerce.buyer_legal_published_page_hash(
        v_version.cms_page_id,
        v_version.page_path,
        v_version.page_title,
        coalesce(v_version.page_description, ''),
        v_content
    );
    return jsonb_build_object(
        'key', v_version.document_key,
        'expectedVersionId', v_version.id,
        'contentHash', v_hash,
        'page', jsonb_build_object(
            'id', v_version.cms_page_id,
            'path', v_version.page_path,
            'title', v_version.page_title,
            'description', coalesce(v_version.page_description, ''),
            'content', v_content
        )
    );
end;
$$;

create function commerce_buyer_legal_test.mutate_version(
    p_version_id uuid,
    p_delete boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_delete then
        delete from commerce.buyer_legal_document_versions
        where id = p_version_id;
    else
        update commerce.buyer_legal_document_versions
        set label = label || ' changed'
        where id = p_version_id;
    end if;
end;
$$;

create function commerce_buyer_legal_test.mutate_acceptance(
    p_acceptance_id bigint,
    p_delete boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_delete then
        delete from commerce.order_buyer_legal_acceptances
        where id = p_acceptance_id;
    else
        update commerce.order_buyer_legal_acceptances
        set correlation_id = gen_random_uuid()
        where id = p_acceptance_id;
    end if;
end;
$$;

grant usage on schema commerce_buyer_legal_test to service_role;
grant select, insert, update on
    commerce_buyer_legal_test.orders,
    commerce_buyer_legal_test.state
to service_role;
grant execute on function commerce_buyer_legal_test.assert_true(boolean, text)
to service_role;
grant execute on function commerce_buyer_legal_test.seed_order(text, boolean)
to service_role;
grant execute on function commerce_buyer_legal_test.verified_snapshot(uuid, text)
to service_role;
grant execute on function commerce_buyer_legal_test.mutate_version(uuid, boolean)
to service_role;
grant execute on function commerce_buyer_legal_test.mutate_acceptance(bigint, boolean)
to service_role;
