\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir baseline.fixture.sql

do $$
declare
    v_constraint text;
    v_order_numbers text[];
    v_seller_id bigint := (
        select id from commerce.sellers where cms_user_id = 'order-read-seller-17'
    );
begin
    begin
        insert into commerce.orders (
            public_id, order_number, checkout_group_id, seller_id,
            buyer_cms_user_id, status, currency, subtotal_amount, total_amount,
            idempotency_key, request_hash
        ) values (
            '00000000-0000-4000-8000-000000000099', 'ORDER-READ-INVALID',
            '10000000-0000-4000-8000-000000000041', v_seller_id,
            'order-read-buyer-a', 'paid', 'eur', 1, 1,
            'order-41', repeat('1', 32)
        );
        raise exception 'order read baseline: invalid paid status was accepted';
    exception when check_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint <> 'orders_status' then raise; end if;
    end;

    select array_agg(order_number order by created_at desc, id desc) into v_order_numbers
    from commerce.orders where order_number like 'ORDER-READ-%';
    if v_order_numbers <> array['ORDER-READ-43', 'ORDER-READ-42', 'ORDER-READ-41'] then
        raise exception 'order read baseline: admin ordering changed: %', v_order_numbers;
    end if;
    select array_agg(order_number order by created_at desc, id desc) into v_order_numbers
    from commerce.orders where buyer_cms_user_id = 'order-read-buyer-a';
    if v_order_numbers <> array['ORDER-READ-42', 'ORDER-READ-41'] then
        raise exception 'order read baseline: buyer ordering changed: %', v_order_numbers;
    end if;
    select array_agg(order_number order by created_at desc, id desc) into v_order_numbers
    from commerce.orders where seller_id = v_seller_id;
    if v_order_numbers <> array['ORDER-READ-42', 'ORDER-READ-41'] then
        raise exception 'order read baseline: seller ordering changed: %', v_order_numbers;
    end if;
end;
$$;

do $$
declare
    v_authorization jsonb;
    v_event_ids bigint[];
    v_operation commerce.protected_order_operations%rowtype;
    v_order_41_id bigint := (
        select id from commerce.orders where order_number = 'ORDER-READ-41'
    );
    v_order_42_id bigint := (
        select id from commerce.orders where order_number = 'ORDER-READ-42'
    );
begin
    v_authorization := commerce.get_order_fulfillment_authorization(
        '00000000-0000-4000-8000-000000000042'
    );
    if jsonb_typeof(v_authorization->'sellerId') <> 'string'
        or v_authorization->>'sellerId' <> 'order-read-seller-17'
        or v_authorization->>'currency' <> 'EUR'
        or v_authorization->>'reason' is not null
        or (v_authorization->>'allowed')::boolean is not true then
        raise exception 'order read baseline: authorization changed: %', v_authorization;
    end if;

    select * into v_operation from commerce.protected_order_operations
    where order_id = v_order_42_id;
    if not found or v_operation.payment_status <> 'succeeded'
        or v_operation.claim_status is not null
        or v_operation.total_refund_requested_amount <> 0 then
        raise exception 'order read baseline: operation changed: %', to_jsonb(v_operation);
    end if;
    if exists (
        select 1 from commerce.protected_order_operations where order_id = v_order_41_id
    ) then
        raise exception 'order read baseline: incomplete operation became visible';
    end if;

    select array_agg(id order by created_at asc, id asc) into v_event_ids
    from commerce.order_events where order_id = v_order_42_id;
    if v_event_ids <> array[9400000000201, 9400000000202]::bigint[] then
        raise exception 'order read baseline: event ordering changed: %', v_event_ids;
    end if;
    if (select to_jsonb(row) from commerce.order_financial_terms row
            where order_id = v_order_41_id) is not null
        or (select to_jsonb(row) from commerce.order_fulfillments row
            where order_id = v_order_41_id) is not null
        or (select to_jsonb(row) from commerce.order_settlements row
            where order_id = v_order_41_id) is not null then
        raise exception 'order read baseline: absent relation stopped being null';
    end if;
end;
$$;

insert into commerce.marketplace_claims (
    public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, seller_response_by_at, created_at, updated_at
) values
    ('20000000-0000-4000-8000-000000000087', :order_42_id,
        'order-read-buyer-a', :seller_17_id, 'damaged', 'resolved_seller',
        'Older claim', '2026-07-19 12:00+00', '2026-07-18 12:00+00', '2026-07-18 12:00+00'),
    ('20000000-0000-4000-8000-000000000088', :order_42_id,
        'order-read-buyer-a', :seller_17_id, 'not_as_described', 'open',
        'Latest claim', '2026-07-20 12:00+00', '2026-07-19 12:00+00', '2026-07-19 12:00+00');

do $$
declare
    v_claim_id bigint;
    v_claim_status text;
    v_order_id bigint := (
        select id from commerce.orders where order_number = 'ORDER-READ-42'
    );
begin
    select id into v_claim_id from commerce.marketplace_claims
    where order_id = v_order_id order by created_at desc limit 1;
    select claim_status into v_claim_status from commerce.protected_order_operations
    where order_id = v_order_id;
    if v_claim_id is null or v_claim_status <> 'open' then
        raise exception 'order read baseline: latest claim changed: %, %',
            v_claim_id, v_claim_status;
    end if;
end;
$$;

do $$
declare
    v_reloptions text[];
    v_rls boolean;
    v_force boolean;
begin
    if not has_table_privilege('service_role', 'commerce.orders', 'SELECT')
        or has_table_privilege('anon', 'commerce.orders', 'SELECT')
        or has_table_privilege('authenticated', 'commerce.orders', 'SELECT')
        or not has_function_privilege(
            'service_role', 'commerce.get_order_fulfillment_authorization(uuid)', 'EXECUTE'
        )
        or has_function_privilege(
            'anon', 'commerce.get_order_fulfillment_authorization(uuid)', 'EXECUTE'
        )
        or has_function_privilege(
            'authenticated', 'commerce.get_order_fulfillment_authorization(uuid)', 'EXECUTE'
        ) then
        raise exception 'order read baseline: private ACL changed';
    end if;
    select reloptions into v_reloptions from pg_catalog.pg_class
    where oid = 'commerce.protected_order_operations'::regclass;
    if not ('security_invoker=true' = any(coalesce(v_reloptions, array[]::text[]))) then
        raise exception 'order read baseline: operation view lost security_invoker';
    end if;
    select relrowsecurity, relforcerowsecurity into v_rls, v_force
    from pg_catalog.pg_class where oid = 'commerce.orders'::regclass;
    if not v_rls or not v_force then
        raise exception 'order read baseline: orders RLS changed';
    end if;
end;
$$;

rollback;
