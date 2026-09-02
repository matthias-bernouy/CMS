\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir ../../../../order/read-model/postgres/baseline.fixture.sql
\ir authorization.fixture.sql

create function pg_temp.jsonb_keys(p_value jsonb)
returns text[] language sql immutable as $$
    select coalesce(array_agg(key order by key), array[]::text[])
    from jsonb_object_keys(p_value) key;
$$;

do $$
declare
    v_complete jsonb := commerce.get_claim_return_authorization_context(9800000000001);
    v_without_terms jsonb := commerce.get_claim_return_authorization_context(9800000000002);
    v_whitespace_seller jsonb := commerce.get_claim_return_authorization_context(9800000000003);
    v_missing jsonb := commerce.get_claim_return_authorization_context(9999999999999);
    v_order_seller bigint;
begin
    if pg_temp.jsonb_keys(v_complete) <> array[
        'claim', 'financial_terms', 'order', 'seller', 'state'
    ] or v_complete->>'state' <> 'ok'
        or pg_temp.jsonb_keys(v_complete->'claim') <> array[
            'buyer_cms_user_id', 'id', 'public_id', 'resolution_outcome',
            'return_delivery_status', 'return_recipient_handoff_at',
            'return_ship_by_at', 'status', 'version'
        ]
        or pg_temp.jsonb_keys(v_complete->'order') <> array[
            'id', 'order_number', 'public_id'
        ]
        or pg_temp.jsonb_keys(v_complete->'seller') <> array[
            'cms_user_id', 'id'
        ]
        or pg_temp.jsonb_keys(v_complete->'financial_terms') <> array[
            'currency', 'delivery_quote_id', 'merchandise_subtotal_amount'
        ] then
        raise exception 'return authorization RPC: bounded envelope changed: %', v_complete;
    end if;

    if (v_complete->'claim'->>'id')::bigint <> 9800000000001
        or v_complete->'claim'->>'buyer_cms_user_id' <> 'order-read-buyer-a'
        or v_complete->'claim'->>'status' <> 'return_required'
        or v_complete->'claim'->>'resolution_outcome' <> 'return_required'
        or v_complete->'claim'->'return_recipient_handoff_at' <> 'null'::jsonb
        or v_complete->'order'->>'order_number' <> 'ORDER-READ-42'
        or v_complete->'order' ?| array['status', 'shipping_address', 'buyer_cms_user_id']
        or v_complete->'seller'->>'cms_user_id' <> 'order-read-seller-17'
        or v_complete->'financial_terms'->>'delivery_quote_id' <> 'quote-42'
        or (v_complete->'financial_terms'->>'merchandise_subtotal_amount')::bigint <> 10000
        or v_complete->'financial_terms'->>'currency' <> 'eur' then
        raise exception 'return authorization RPC: complete projection changed: %', v_complete;
    end if;

    if v_without_terms->>'state' <> 'ok'
        or v_without_terms->'claim'->>'buyer_cms_user_id'
            <> 'claim-return-buyer-shadow'
        or v_without_terms->'financial_terms' <> 'null'::jsonb
        or v_without_terms->'order' is null
        or v_without_terms->'seller' is null then
        raise exception 'return authorization RPC: optional terms changed: %', v_without_terms;
    end if;

    select orders.seller_id into v_order_seller
    from commerce.orders orders
    where orders.id = (v_whitespace_seller->'order'->>'id')::bigint;
    if v_whitespace_seller->>'state' <> 'ok'
        or v_whitespace_seller->'seller'->>'cms_user_id' <> E'\t'
        or (v_whitespace_seller->'seller'->>'id')::bigint = v_order_seller then
        raise exception 'return authorization RPC: claim seller source changed: %',
            v_whitespace_seller;
    end if;

    if v_missing <> '{"state":"not_found"}'::jsonb then
        raise exception 'return authorization RPC: missing state changed: %', v_missing;
    end if;
end;
$$;

do $$
declare
    v_function oid := to_regprocedure(
        'commerce.get_claim_return_authorization_context(bigint)'
    );
    v_volatile "char";
    v_security_definer boolean;
    v_config text[];
begin
    if v_function is null then
        raise exception 'return authorization RPC: function signature missing';
    end if;
    select provolatile, prosecdef, proconfig
    into v_volatile, v_security_definer, v_config
    from pg_catalog.pg_proc
    where oid = v_function;
    if v_volatile <> 's' or v_security_definer
        or not ('search_path=""' = any(coalesce(v_config, array[]::text[])))
        or not has_function_privilege('service_role', v_function, 'EXECUTE')
        or has_function_privilege('anon', v_function, 'EXECUTE')
        or has_function_privilege('authenticated', v_function, 'EXECUTE') then
        raise exception 'return authorization RPC: unsafe attributes or ACL';
    end if;
end;
$$;

rollback;
