begin;

do $security$
declare
    target oid := pg_catalog.to_regprocedure(
        'stripe_connect.claim_commerce_projection_outbox(text,integer)'
    );
begin
    if target is null then
        raise exception 'provider reconciliation: claim RPC is missing';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 'v'
              or not proretset
              or prorettype <> 'stripe_connect.commerce_projection_outbox'::pg_catalog.regtype
              or proacl is null
              or not coalesce(proconfig @> array['search_path=""'], false)
              or exists (
                  select 1
                  from pg_catalog.aclexplode(proacl)
                  where grantee = 0 and privilege_type = 'EXECUTE'
              )
          )
    ) then
        raise exception 'provider reconciliation: claim RPC security changed';
    end if;
    if pg_catalog.has_function_privilege('anon', target, 'execute')
       or pg_catalog.has_function_privilege('authenticated', target, 'execute')
       or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
        raise exception 'provider reconciliation: claim RPC grants changed';
    end if;
end;
$security$;

set local role anon;
do $anon$
begin
    perform * from stripe_connect.claim_commerce_projection_outbox('anon', 1);
    raise exception 'provider reconciliation: anon executed claim RPC';
exception when insufficient_privilege then
    null;
end;
$anon$;
reset role;

set local role authenticated;
do $authenticated$
begin
    perform * from stripe_connect.claim_commerce_projection_outbox('authenticated', 1);
    raise exception 'provider reconciliation: authenticated executed claim RPC';
exception when insufficient_privilege then
    null;
end;
$authenticated$;
reset role;

set local role service_role;
select pg_catalog.count(*)
from stripe_connect.claim_commerce_projection_outbox('service-role-contract', 1);
reset role;

rollback;
