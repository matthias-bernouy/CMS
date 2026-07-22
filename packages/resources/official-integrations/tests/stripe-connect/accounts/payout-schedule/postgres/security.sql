begin;

do $security$
declare
    target oid := pg_catalog.to_regprocedure(
        'stripe_connect.claim_seller_payout_hold(text,text,boolean,boolean)'
    );
begin
    if target is null then
        raise exception 'payout schedule: claim RPC is missing';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 'v'
              or prorettype <> 'jsonb'::pg_catalog.regtype
              or proacl is null
              or not coalesce(proconfig @> array['search_path=""'], false)
              or exists (
                  select 1
                  from pg_catalog.aclexplode(proacl)
                  where grantee = 0 and privilege_type = 'EXECUTE'
              )
          )
    ) then
        raise exception 'payout schedule: claim RPC security changed';
    end if;
    if pg_catalog.has_function_privilege('anon', target, 'execute')
       or pg_catalog.has_function_privilege('authenticated', target, 'execute')
       or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
        raise exception 'payout schedule: claim RPC grants changed';
    end if;
end;
$security$;

rollback;
