\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir baseline.fixture.sql

do $$
declare
    v_order_41_id bigint := (
        select id from commerce.orders where order_number = 'ORDER-READ-41'
    );
    v_order_42_id bigint := (
        select id from commerce.orders where order_number = 'ORDER-READ-42'
    );
    v_result jsonb;
begin
    if commerce.get_order_detail_read_model(null, null, null, null)->>'state'
            <> 'invalid_scope'
        or commerce.get_order_detail_read_model('unknown', null, null, null)->>'state'
            <> 'invalid_scope'
        or commerce.get_order_detail_read_model('admin', null, null, null)->>'state'
            <> 'selector_required'
        or commerce.get_order_detail_read_model('seller', null, v_order_42_id, null)->>'state'
            <> 'identity_required'
        or commerce.get_order_detail_read_model('seller', 'missing', null, 'invalid')->>'state'
            <> 'not_found'
        or commerce.get_order_detail_read_model('buyer', null, 999999, null)->>'state'
            <> 'not_found'
        or commerce.get_order_detail_read_model('buyer', null, 3000000000, null)->>'state'
            <> 'not_found'
        or commerce.get_order_detail_read_model('buyer', null, v_order_42_id, null)->>'state'
            <> 'identity_required'
        or commerce.get_order_detail_read_model('buyer', 'other-buyer', v_order_42_id, null)->>'state'
            <> 'not_found'
        or commerce.get_order_detail_read_model('seller', 'order-read-seller-18', v_order_42_id, null)->>'state'
            <> 'not_found' then
        raise exception 'order detail RPC: access state changed';
    end if;

    if commerce.get_order_detail_read_model(
            'buyer', 'order-read-buyer-a', v_order_42_id, 'invalid'
        )->>'state' <> 'ok'
        or commerce.get_order_detail_read_model(
            'buyer', 'order-read-buyer-a', null,
            ' 00000000-0000-4000-8000-000000000042 '
        )->>'state' <> 'ok'
        or commerce.get_order_detail_read_model(
            'seller', 'order-read-seller-17', null,
            '00000000-0000-4000-8000-000000000042'
        )->>'state' <> 'ok'
        or commerce.get_order_detail_read_model(
            'admin', null, null, '00000000-0000-4000-8000-000000000042'
        )->>'state' <> 'ok' then
        raise exception 'order detail RPC: selector priority/lookup changed';
    end if;

    begin
        perform commerce.get_order_detail_read_model('buyer', null, null, 'invalid');
        raise exception 'buyer invalid UUID was accepted';
    exception when invalid_text_representation then null;
    end;
    begin
        perform commerce.get_order_detail_read_model(
            'seller', 'order-read-seller-17', null, 'invalid'
        );
        raise exception 'seller invalid UUID was accepted';
    exception when invalid_text_representation then null;
    end;

    v_result := commerce.get_order_detail_read_model(
        'seller', 'order-read-seller-17', v_order_41_id, null
    );
    if v_result->>'state' <> 'ok'
        or v_result->'lines' <> '[]'::jsonb
        or v_result->'events' <> '[]'::jsonb
        or v_result->'operation' <> 'null'::jsonb
        or v_result->'financial_terms' <> 'null'::jsonb
        or v_result->'fulfillment' <> 'null'::jsonb
        or v_result->'settlement' <> 'null'::jsonb
        or v_result->'authorization'->>'reason' <> 'financial_terms_missing'
        or v_result->'authorization'->>'currency' <> '' then
        raise exception 'order detail RPC: partial seller detail changed: %', v_result;
    end if;
end;
$$;

do $$
declare
    v_function oid := to_regprocedure(
        'commerce.get_order_detail_read_model(text,text,bigint,text)'
    );
    v_volatile "char";
    v_security_definer boolean;
    v_config text[];
begin
    if v_function is null then
        raise exception 'order detail RPC: function signature missing';
    end if;
    select provolatile, prosecdef, proconfig
    into v_volatile, v_security_definer, v_config
    from pg_catalog.pg_proc where oid = v_function;
    if v_volatile <> 's' or v_security_definer
        or not ('search_path=""' = any(coalesce(v_config, array[]::text[])))
        or not has_function_privilege('service_role', v_function, 'EXECUTE')
        or has_function_privilege('anon', v_function, 'EXECUTE')
        or has_function_privilege('authenticated', v_function, 'EXECUTE') then
        raise exception 'order detail RPC: unsafe attributes or ACL';
    end if;
end;
$$;

rollback;
