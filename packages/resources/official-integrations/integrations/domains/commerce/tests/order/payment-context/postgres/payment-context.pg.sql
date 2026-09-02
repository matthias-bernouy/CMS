\set ON_ERROR_STOP on

begin;

do $security$
declare
    target oid := to_regprocedure(
        'commerce.get_order_payment_context(bigint,text)'
    );
begin
    if target is null then
        raise exception 'payment context: RPC is missing';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 's'
              or not coalesce(proconfig @> array['search_path=""'], false)
          )
    ) then
        raise exception 'payment context: RPC security attributes are invalid';
    end if;
    if has_function_privilege('anon', target, 'execute')
       or has_function_privilege('authenticated', target, 'execute')
       or not has_function_privilege('service_role', target, 'execute') then
        raise exception 'payment context: RPC privileges are invalid';
    end if;
end;
$security$;

set local role service_role;
\ir ../../read-model/postgres/baseline.fixture.sql

do $contract$
declare
    order_id bigint;
    result jsonb;
begin
    select id into order_id
    from commerce.orders
    where public_id = '00000000-0000-4000-8000-000000000042';

    result := commerce.get_order_payment_context(
        order_id,
        'order-read-buyer-a'
    );
    if result is distinct from jsonb_build_object(
        'state', 'ok',
        'context', jsonb_build_object(
            'id', order_id,
            'public_id', '00000000-0000-4000-8000-000000000042',
            'buyer_cms_user_id', 'order-read-buyer-a'
        )
    ) then
        raise exception 'payment context: full projection changed: %', result;
    end if;

    if commerce.get_order_payment_context(order_id, ' order-read-buyer-a ')
        is distinct from result then
        raise exception 'payment context: trimmed actor changed';
    end if;
    if commerce.get_order_payment_context(order_id, 'order-read-buyer-b')
        is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'payment context: wrong buyer is visible';
    end if;
    if commerce.get_order_payment_context(9007199254740991, 'order-read-buyer-a')
        is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_payment_context(null, 'order-read-buyer-a')
        is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'payment context: missing order state changed';
    end if;
    if commerce.get_order_payment_context(order_id, null)
        is distinct from '{"state":"identity_required"}'::jsonb
       or commerce.get_order_payment_context(order_id, '  ')
        is distinct from '{"state":"identity_required"}'::jsonb then
        raise exception 'payment context: missing actor state changed';
    end if;
end;
$contract$;

rollback;
