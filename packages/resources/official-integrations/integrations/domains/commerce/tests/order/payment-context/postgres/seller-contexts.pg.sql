\set ON_ERROR_STOP on

begin;

do $security$
declare
    target oid := to_regprocedure(
        'commerce.get_protected_seller_context(text,bigint[],bigint,text)'
    );
begin
    if target is null then
        raise exception 'seller context: RPC is missing';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 'v'
              or not coalesce(proconfig @> array['search_path=""'], false)
          )
    ) then
        raise exception 'seller context: RPC attributes are invalid';
    end if;
    if has_function_privilege('anon', target, 'execute')
       or has_function_privilege('authenticated', target, 'execute')
       or not has_function_privilege('service_role', target, 'execute') then
        raise exception 'seller context: RPC privileges are invalid';
    end if;
end;
$security$;

set local role service_role;
\ir seller-context.fixture.sql

do $contract$
declare
    result jsonb;
    offer_a_id bigint;
    offer_b_id bigint;
    offer_c_id bigint;
    offer_d_id bigint;
    order_a_id bigint;
    order_b_id bigint;
    order_c_id bigint;
begin
    select
        max(id) filter (where slug = 'seller-context-offer-a'),
        max(id) filter (where slug = 'seller-context-offer-b'),
        max(id) filter (where slug = 'seller-context-offer-c'),
        max(id) filter (where slug = 'seller-context-offer-d')
    into offer_a_id, offer_b_id, offer_c_id, offer_d_id
    from commerce.offers;
    select
        max(id) filter (where order_number = 'SELLER-CONTEXT-A'),
        max(id) filter (where order_number = 'SELLER-CONTEXT-B'),
        max(id) filter (where order_number = 'SELLER-CONTEXT-C')
    into order_a_id, order_b_id, order_c_id
    from commerce.orders;

    result := commerce.get_protected_seller_context(
        'checkout', array[offer_a_id, offer_b_id], null,
        '  seller-context-buyer  '
    );
    if result is distinct from jsonb_build_object(
        'state', 'ok',
        'context', jsonb_build_object(
            'seller_cms_user_id', 'seller-context-owner',
            'buyer_cms_user_id', 'seller-context-buyer'
        )
    ) then
        raise exception 'seller context: checkout projection changed: %', result;
    end if;
    if commerce.get_protected_seller_context(
        'checkout', array[offer_a_id, 9007199254740991], null, null
    )->>'state' <> 'offer_not_found' then
        raise exception 'seller context: missing offer precedence changed';
    end if;
    if commerce.get_protected_seller_context(
        'checkout', array[offer_a_id, offer_c_id], null, null
    )->>'state' <> 'multiple_sellers' then
        raise exception 'seller context: multiple seller precedence changed';
    end if;
    if commerce.get_protected_seller_context(
        'checkout', array[offer_a_id], null, '  '
    )->>'state' <> 'identity_required' then
        raise exception 'seller context: checkout identity gate changed';
    end if;
    if commerce.get_protected_seller_context(
        'checkout', array[offer_d_id], null, 'seller-context-buyer'
    )->>'state' <> 'seller_unavailable' then
        raise exception 'seller context: checkout seller gate changed';
    end if;

    result := commerce.get_protected_seller_context(
        'payment', null, order_a_id, '  seller-context-buyer  '
    );
    if result->>'state' <> 'ok'
       or result->'context'->>'seller_cms_user_id' <> 'seller-context-owner'
       or result->'context'->>'buyer_cms_user_id' <> 'seller-context-buyer'
       or (select count(*) from jsonb_object_keys(result->'context')) <> 2 then
        raise exception 'seller context: payment projection changed: %', result;
    end if;
    if commerce.get_protected_seller_context(
        'payment', null, order_a_id, 'other-buyer'
    )->>'state' <> 'order_not_found' then
        raise exception 'seller context: payment ownership changed';
    end if;
    if commerce.get_protected_seller_context(
        'payment', null, order_b_id, 'seller-context-buyer'
    )->>'state' <> 'order_not_found' then
        raise exception 'seller context: stored buyer was normalized';
    end if;
    if commerce.get_protected_seller_context(
        'payment', null, order_a_id, null
    )->>'state' <> 'identity_required' then
        raise exception 'seller context: payment identity gate changed';
    end if;
    if commerce.get_protected_seller_context(
        'payment', null, order_c_id, 'seller-context-buyer'
    )->>'state' <> 'seller_unavailable' then
        raise exception 'seller context: payment seller gate changed';
    end if;
    if commerce.get_protected_seller_context(
        'unknown', null, null, 'seller-context-buyer'
    )->>'state' <> 'invalid_request' then
        raise exception 'seller context: invalid mode did not fail closed';
    end if;
end;
$contract$;

rollback;
