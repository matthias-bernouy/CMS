create schema commerce_pre_provider_test;

create table commerce_pre_provider_test.cases (
    label text primary key,
    order_id bigint not null,
    public_id uuid not null,
    attempt_id bigint not null,
    cancellation_key text not null,
    occurred_at timestamptz not null
);

create function commerce_pre_provider_test.assert_true(
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
        raise exception 'pre-provider cancellation contract: %', p_message;
    end if;
end;
$$;

create function commerce_pre_provider_test.seed_case(
    p_label text,
    p_status text default 'created',
    p_provider_payment_id bigint default null,
    p_provider_payment_intent_id text default null,
    p_provider_charge_id text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_checkout_group_id uuid;
    v_order commerce.orders%rowtype;
    v_attempt_id bigint;
    v_cancellation_key text;
    v_occurred_at timestamptz := pg_catalog.clock_timestamp();
begin
    insert into commerce.checkout_groups (
        buyer_cms_user_id, idempotency_key, request_hash
    ) values (
        'pre-provider-buyer-' || p_label,
        'pre-provider-order-' || p_label,
        pg_catalog.md5('pre-provider-order-' || p_label)
    ) returning id into v_checkout_group_id;

    insert into commerce.orders (
        order_number, checkout_group_id, seller_id, buyer_cms_user_id,
        status, currency, subtotal_amount, total_amount,
        idempotency_key, request_hash
    ) select
        'PRE-PROVIDER-' || pg_catalog.upper(p_label),
        v_checkout_group_id,
        seller.id,
        'pre-provider-buyer-' || p_label,
        'awaiting_payment',
        'eur',
        100,
        100,
        'pre-provider-order-' || p_label,
        pg_catalog.md5('pre-provider-order-' || p_label)
    from commerce.sellers seller
    where seller.slug = 'default'
    returning * into strict v_order;

    insert into commerce.order_fulfillments (
        order_id, seller_handoff_deadline, scan_grace_deadline
    ) values (
        v_order.id, now() + interval '1 day', now() + interval '2 days'
    );
    insert into commerce.order_settlements (
        order_id, authorized_seller_amount, platform_gross_remainder_amount
    ) values (
        v_order.id, 100, 0
    );
    insert into commerce.order_payment_attempts (
        order_id, provider_payment_id, provider_payment_intent_id,
        provider_charge_id, client_reference_id, status,
        amount, currency, financial_terms_hash
    ) values (
        v_order.id, p_provider_payment_id, p_provider_payment_intent_id,
        p_provider_charge_id, v_order.public_id::text, p_status,
        100, 'eur', repeat('a', 64)
    ) returning id into v_attempt_id;

    perform commerce.ensure_payment_cancellation_request(
        v_order.id,
        'cancelled',
        'Contract cancellation before provider creation',
        'pre-provider-contract',
        null
    );
    select business_key into strict v_cancellation_key
    from commerce.payment_cancellation_requests
    where order_id = v_order.id;

    insert into commerce_pre_provider_test.cases (
        label, order_id, public_id, attempt_id, cancellation_key, occurred_at
    ) values (
        p_label, v_order.id, v_order.public_id, v_attempt_id,
        v_cancellation_key, v_occurred_at
    );
end;
$$;
