\set ON_ERROR_STOP on
begin;
do $security$
declare
    signature text;
    target oid;
begin
    foreach signature in array array[
        'commerce.get_order_delivery_setup_context(bigint,text)',
        'commerce.get_order_delivery_selection_context(bigint,text)'
    ] loop
        target := to_regprocedure(signature);
        if target is null then
            raise exception 'relay context: RPC is missing: %', signature;
        end if;
        if exists (
            select 1
            from pg_catalog.pg_proc
            where oid = target
              and (
                  prosecdef
                  or provolatile <> 's'
                  or proacl is null
                  or not coalesce(
                      proconfig @> array['search_path=""'],
                      false
                  )
                  or exists (
                      select 1
                      from pg_catalog.aclexplode(proacl)
                      where grantee = 0
                        and privilege_type = 'EXECUTE'
                  )
              )
        ) then
            raise exception 'relay context: invalid RPC attributes: %',
                signature;
        end if;
        if has_function_privilege('anon', target, 'execute')
           or has_function_privilege('authenticated', target, 'execute')
           or not has_function_privilege(
               'service_role',
               target,
               'execute'
           ) then
            raise exception 'relay context: invalid RPC privileges: %',
                signature;
        end if;
    end loop;
end;
$security$;
set local role service_role;
\ir ../../read-model/postgres/baseline.fixture.sql
update commerce.orders
set status = 'awaiting_quote',
    shipping_address = '{"addressLine1":"private buyer address"}',
    billing_address = '{"addressLine1":"must not leak"}',
    metadata = '{"private":"must not leak"}'
where public_id = '00000000-0000-4000-8000-000000000041';
update commerce.sellers
set kind = 'merchant',
    cms_user_id = null
where cms_user_id = 'order-read-seller-18';
do $contract$
declare
    awaiting_id bigint;
    finalized_id bigint;
    merchant_id bigint;
    setup jsonb;
begin
    select id into awaiting_id from commerce.orders
    where public_id = '00000000-0000-4000-8000-000000000041';
    select id into finalized_id from commerce.orders
    where public_id = '00000000-0000-4000-8000-000000000042';
    select id into merchant_id from commerce.orders
    where public_id = '00000000-0000-4000-8000-000000000043';
    setup := commerce.get_order_delivery_setup_context(
        awaiting_id,
        'order-read-buyer-a'
    );
    if setup is distinct from jsonb_build_object(
        'state', 'ok',
        'context', jsonb_build_object(
            'order', jsonb_build_object(
                'public_id', '00000000-0000-4000-8000-000000000041',
                'buyer_cms_user_id', 'order-read-buyer-a',
                'status', 'awaiting_quote',
                'version', 2
            ),
            'authorization', jsonb_build_object(
                'buyer_cms_user_id', 'order-read-buyer-a',
                'status', 'awaiting_quote',
                'order_version', 2,
                'seller_cms_user_id', 'order-read-seller-17',
                'currency', 'eur',
                'merchandise_subtotal_minor_amount', 8000,
                'shipping_address',
                    '{"addressLine1":"private buyer address"}'::jsonb
            )
        )
    ) then
        raise exception 'relay setup projection changed: %', setup;
    end if;
    if commerce.get_order_delivery_setup_context(
        awaiting_id,
        ' order-read-buyer-a '
    ) is distinct from setup then
        raise exception 'relay setup actor trimming changed';
    end if;
    if commerce.get_order_delivery_setup_context(
        awaiting_id,
        'other-buyer'
    ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_delivery_setup_context(
           9007199254740991,
           'order-read-buyer-a'
       ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_delivery_setup_context(
           null,
           'order-read-buyer-a'
       ) is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'relay setup ownership boundary changed';
    end if;
    if commerce.get_order_delivery_setup_context(awaiting_id, null)
        is distinct from '{"state":"identity_required"}'::jsonb
       or commerce.get_order_delivery_setup_context(awaiting_id, '  ')
        is distinct from '{"state":"identity_required"}'::jsonb then
        raise exception 'relay setup identity boundary changed';
    end if;
    update commerce.orders
    set status = 'awaiting_quote'
    where id = merchant_id;
    if commerce.get_order_delivery_setup_context(
        merchant_id,
        'order-read-buyer-b'
    ) is distinct from '{"state":"seller_unavailable"}'::jsonb then
        raise exception 'relay setup invalid seller state changed';
    end if;
    update commerce.orders set status = 'completed' where id = merchant_id;
    setup := commerce.get_order_delivery_setup_context(
        merchant_id,
        'order-read-buyer-b'
    );
    if setup #> '{context,authorization}' is distinct from 'null'::jsonb
       or setup #>> '{context,order,status}' <> 'completed' then
        raise exception 'relay setup status precedence changed: %', setup;
    end if;
    if commerce.get_order_delivery_selection_context(
        finalized_id,
        'order-read-buyer-a'
    ) is distinct from jsonb_build_object(
        'state', 'ok',
        'context', jsonb_build_object(
            'public_id', '00000000-0000-4000-8000-000000000042',
            'buyer_cms_user_id', 'order-read-buyer-a',
            'delivery_quote_id', 'quote-42'
        )
    ) then
        raise exception 'relay selection projection changed';
    end if;
    setup := commerce.get_order_delivery_selection_context(
        awaiting_id,
        'order-read-buyer-a'
    );
    if setup #> '{context,delivery_quote_id}' is distinct from 'null'::jsonb
       or not (setup #> '{context}' ? 'delivery_quote_id') then
        raise exception 'relay selection null terms changed: %', setup;
    end if;
    if commerce.get_order_delivery_selection_context(
        finalized_id,
        'other-buyer'
    ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_delivery_selection_context(finalized_id, null)
        is distinct from '{"state":"identity_required"}'::jsonb then
        raise exception 'relay selection actor boundary changed';
    end if;
end;
$contract$;
rollback;
