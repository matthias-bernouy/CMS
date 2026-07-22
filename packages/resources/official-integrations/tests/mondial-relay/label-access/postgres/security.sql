begin;

do $security$
declare
    target oid := pg_catalog.to_regprocedure(
        'delivery.get_label_access_context(text,text,timestamp with time zone)'
    );
begin
    if target is null then
        raise exception 'label access: missing future context RPC';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 'v'
              or proretset
              or pg_catalog.pg_get_function_result(oid) <> 'jsonb'
              or not coalesce(
                  proconfig @> array['search_path=""'], false
              )
              or proacl is null
              or exists (
                  select 1
                  from pg_catalog.aclexplode(proacl)
                  where grantee = 0 and privilege_type = 'EXECUTE'
              )
          )
    ) then
        raise exception 'label access: context RPC attributes changed';
    end if;
    if pg_catalog.has_function_privilege('anon', target, 'execute')
       or pg_catalog.has_function_privilege('authenticated', target, 'execute')
       or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
        raise exception 'label access: context RPC grants changed';
    end if;
end;
$security$;

rollback;
