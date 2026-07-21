begin;

do $security$
declare
    target oid := to_regprocedure(
        'delivery.declare_seller_handoff(text,text)'
    );
begin
    if target is null then
        raise exception 'seller handoff: RPC is missing';
    end if;
    if exists (
        select 1 from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 'v'
              or proacl is null
              or not coalesce(
                  proconfig @> array['search_path=""'], false
              )
              or exists (
                  select 1 from pg_catalog.aclexplode(proacl)
                  where grantee = 0 and privilege_type = 'EXECUTE'
              )
          )
    ) then
        raise exception 'seller handoff: RPC security changed';
    end if;
    if has_function_privilege('anon', target, 'execute')
       or has_function_privilege('authenticated', target, 'execute')
       or not has_function_privilege('service_role', target, 'execute') then
        raise exception 'seller handoff: RPC grants changed';
    end if;
end;
$security$;

rollback;
