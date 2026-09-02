begin;

do $cancellation_operation_security$
declare
    target oid := pg_catalog.to_regprocedure(
        'stripe_connect.reserve_payment_cancellation_operation(bigint,text,text,jsonb)'
    );
begin
    if target is null then
        raise exception 'provider reconciliation: missing future cancellation operation RPC';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 'v'
              or not proretset
              or pg_catalog.pg_get_function_result(oid)
                    <> 'TABLE(payment jsonb, operation jsonb)'
              or not coalesce(proconfig @> array['search_path=""'], false)
              or exists (
                  select 1 from pg_catalog.aclexplode(proacl)
                  where grantee = 0 and privilege_type = 'EXECUTE'
              )
          )
    ) then
        raise exception 'provider reconciliation: cancellation operation RPC contract changed';
    end if;
    if pg_catalog.has_function_privilege('anon', target, 'execute')
       or pg_catalog.has_function_privilege('authenticated', target, 'execute')
       or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
        raise exception 'provider reconciliation: cancellation operation RPC grants changed';
    end if;
end;
$cancellation_operation_security$;

set local role anon;
do $anon$
begin
    perform * from stripe_connect.reserve_payment_cancellation_operation(
        -900000001, 'missing', 'provider-reconciliation-pg-anon', '{}'::jsonb
    );
    raise exception 'provider reconciliation: anon executed cancellation operation RPC';
exception when insufficient_privilege then
    null;
end;
$anon$;
reset role;

set local role authenticated;
do $authenticated$
begin
    perform * from stripe_connect.reserve_payment_cancellation_operation(
        -900000001, 'missing', 'provider-reconciliation-pg-authenticated', '{}'::jsonb
    );
    raise exception 'provider reconciliation: authenticated executed cancellation operation RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated$;
reset role;

rollback;
