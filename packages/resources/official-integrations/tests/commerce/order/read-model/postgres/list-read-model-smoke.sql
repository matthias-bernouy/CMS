\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir baseline.fixture.sql

insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, unit, public_readable, position, enabled
) values
    ('order', 'publicB', 'Public B', 'string', null, true, 5, true),
    ('order', 'publicA', 'Public A', 'number', 'g', true, 5, true),
    ('order', 'privateField', 'Private', 'string', null, false, 1, true),
    ('order', 'disabledField', 'Disabled', 'string', null, true, 1, false);

do $$
declare
    v_buyer jsonb := commerce.list_order_read_model(
        'buyer', 'order-read-buyer-a', null, 999, 10, 0
    );
    v_seller jsonb := commerce.list_order_read_model(
        'seller', 'order-read-seller-17', null, 999, 10, 0
    );
    v_admin jsonb := commerce.list_order_read_model('admin', null, null, null, 10, 0);
    v_keys text[];
begin
    select array_agg(key order by key) into v_keys from jsonb_object_keys(v_buyer) key;
    if v_keys <> array['definitions', 'operations', 'orders', 'state', 'total'] then
        raise exception 'order list smoke: envelope keys changed: %', v_keys;
    end if;
    if v_buyer->>'state' <> 'ok' or (v_buyer->>'total')::integer <> 2
        or (select array_agg(item->>'order_number') from jsonb_array_elements(v_buyer->'orders') item)
            <> array['ORDER-READ-42', 'ORDER-READ-41'] then
        raise exception 'order list smoke: buyer ownership/order changed: %', v_buyer;
    end if;
    if v_seller->>'state' <> 'ok' or (v_seller->>'total')::integer <> 2
        or (select array_agg(item->>'order_number') from jsonb_array_elements(v_seller->'orders') item)
            <> array['ORDER-READ-42', 'ORDER-READ-41'] then
        raise exception 'order list smoke: seller ownership/order changed: %', v_seller;
    end if;
    if v_admin->>'state' <> 'ok' or (v_admin->>'total')::integer <> 3
        or (select array_agg(item->>'order_number') from jsonb_array_elements(v_admin->'orders') item)
            <> array['ORDER-READ-43', 'ORDER-READ-42', 'ORDER-READ-41'] then
        raise exception 'order list smoke: admin ordering changed: %', v_admin;
    end if;

    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_buyer->'orders'->0) key;
    if v_keys <> array[
        'archived_at', 'billing_address', 'buyer_cms_user_id', 'checkout_group_id',
        'created_at', 'currency', 'delivery_quoted_at', 'id', 'idempotency_key',
        'metadata', 'order_number', 'public_id', 'seller_id', 'shipping_address',
        'shipping_amount', 'status', 'subtotal_amount', 'total_amount', 'updated_at', 'version'
    ] or v_buyer->'orders'->0 ? 'request_hash' then
        raise exception 'order list smoke: buyer order projection changed: %', v_keys;
    end if;
    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_seller->'orders'->0) key;
    if v_keys <> array[
        'checkout_group_id', 'created_at', 'currency', 'delivery_quoted_at', 'id',
        'metadata', 'order_number', 'public_id', 'shipping_amount', 'status',
        'subtotal_amount', 'total_amount', 'updated_at', 'version'
    ] or v_seller::text like '%order-read-buyer-%'
        or v_seller::text like '%order-42%'
        or v_seller->'orders'->0 ?| array[
            'seller_id', 'buyer_cms_user_id', 'shipping_address', 'billing_address',
            'idempotency_key', 'request_hash', 'archived_at'
        ] then
        raise exception 'order list smoke: seller projection leaked data: %', v_seller;
    end if;
    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_buyer->'operations'->0) key;
    if v_keys <> array[
        'claim_status', 'fulfillment_status', 'order_id', 'payment_status',
        'settlement_status', 'total_refund_requested_amount', 'updated_at'
    ] or jsonb_array_length(v_buyer->'operations') <> 1
        or jsonb_array_length(v_seller->'operations') <> 0 then
        raise exception 'order list smoke: operation projection changed: %', v_buyer->'operations';
    end if;
    select array_agg(item->>'key') into v_keys
    from jsonb_array_elements(v_buyer->'definitions') item;
    if v_keys <> array['publicA', 'publicB']
        or v_seller->'definitions' <> v_buyer->'definitions'
        or jsonb_array_length(v_admin->'definitions') <> 0
        or (select array_agg(key order by key)
            from jsonb_object_keys(v_buyer->'definitions'->0) key)
            <> array['field_type', 'key', 'label', 'unit'] then
        raise exception 'order list smoke: definitions changed: %', v_buyer->'definitions';
    end if;
end;
$$;

do $$
declare
    v_seller_id bigint := (
        select id from commerce.sellers where cms_user_id = 'order-read-seller-17'
    );
    v_result jsonb;
begin
    v_result := commerce.list_order_read_model('admin', null, null, v_seller_id, 10, 0);
    if (v_result->>'total')::integer <> 2 then
        raise exception 'order list smoke: admin seller filter changed: %', v_result;
    end if;
    v_result := commerce.list_order_read_model('admin', null, 'active', null, 10, 0);
    if (v_result->>'total')::integer <> 1
        or v_result->'orders'->0->>'order_number' <> 'ORDER-READ-42' then
        raise exception 'order list smoke: status filter changed: %', v_result;
    end if;
    v_result := commerce.list_order_read_model(
        'buyer', 'order-read-buyer-a', 'active', null, 10, 0
    );
    if (v_result->>'total')::integer <> 1
        or v_result->'orders'->0->>'order_number' <> 'ORDER-READ-42' then
        raise exception 'order list smoke: buyer status filter changed: %', v_result;
    end if;
    v_result := commerce.list_order_read_model(
        'buyer', 'order-read-buyer-a', null, null, 2, 3000000000
    );
    if (v_result->>'total')::integer <> 2 or jsonb_array_length(v_result->'orders') <> 0
        or jsonb_array_length(v_result->'definitions') <> 2 then
        raise exception 'order list smoke: deep offset lost total/definitions: %', v_result;
    end if;
    v_result := commerce.list_order_read_model(
        'seller', 'order-read-seller-17', 'completed', null, 10, 0
    );
    if (v_result->>'total')::integer <> 0
        or jsonb_array_length(v_result->'definitions') <> 2 then
        raise exception 'order list smoke: empty seller page changed: %', v_result;
    end if;
    v_result := commerce.list_order_read_model('seller', 'missing-seller', null, null, 10, 0);
    if v_result <> jsonb_build_object(
        'state', 'seller_missing', 'orders', '[]'::jsonb, 'operations', '[]'::jsonb,
        'definitions', '[]'::jsonb, 'total', 0
    ) then raise exception 'order list smoke: missing seller changed: %', v_result; end if;
    if commerce.list_order_read_model(null, null, null, null, 10, 0)->>'state' <> 'invalid_scope'
        or commerce.list_order_read_model('unknown', null, null, null, 10, 0)->>'state' <> 'invalid_scope'
        or commerce.list_order_read_model('buyer', null, null, null, 10, 0)->>'state' <> 'identity_required'
        or commerce.list_order_read_model('seller', ' ', null, null, 10, 0)->>'state' <> 'identity_required' then
        raise exception 'order list smoke: invalid state handling changed';
    end if;
    v_result := commerce.list_order_read_model('admin', null, null, null, 0, -1);
    if jsonb_array_length(v_result->'orders') <> 1
        or v_result->'orders'->0->>'order_number' <> 'ORDER-READ-43' then
        raise exception 'order list smoke: defensive clamps changed: %', v_result;
    end if;
end;
$$;

do $$
declare
    v_function oid := to_regprocedure(
        'commerce.list_order_read_model(text,text,text,bigint,integer,bigint)'
    );
    v_volatile "char";
    v_security_definer boolean;
    v_config text[];
begin
    if v_function is null then raise exception 'order list smoke: function signature missing'; end if;
    select provolatile, prosecdef, proconfig into v_volatile, v_security_definer, v_config
    from pg_catalog.pg_proc where oid = v_function;
    if v_volatile <> 's' or v_security_definer
        or not ('search_path=""' = any(coalesce(v_config, array[]::text[])))
        or not has_function_privilege('service_role', v_function, 'EXECUTE')
        or has_function_privilege('anon', v_function, 'EXECUTE')
        or has_function_privilege('authenticated', v_function, 'EXECUTE') then
        raise exception 'order list smoke: unsafe function attributes/ACL';
    end if;
end;
$$;

rollback;
