begin;

do $security$
declare
    target oid := pg_catalog.to_regprocedure('delivery.read_tracking_summary(text)');
begin
    if target is null or exists (
        select 1
        from pg_catalog.pg_proc procedure
        where procedure.oid = target
          and (
              procedure.prosecdef
              or not procedure.proretset
              or procedure.provolatile::text <> 'v'
              or procedure.proacl is null
              or not coalesce(procedure.proconfig @> array['search_path=""'], false)
              or pg_catalog.pg_get_function_identity_arguments(target) <> 'p_expedition_number text'
              or pg_catalog.pg_get_function_result(target) <> 'TABLE(shipment jsonb, events jsonb)'
              or exists (
                  select 1
                  from pg_catalog.aclexplode(procedure.proacl)
                  where grantee = 0 and privilege_type = 'EXECUTE'
              )
          )
    ) then
        raise exception 'tracking summary: private VOLATILE RPC metadata changed';
    end if;
    if pg_catalog.has_function_privilege('anon', target, 'execute')
       or pg_catalog.has_function_privilege('authenticated', target, 'execute')
       or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
        raise exception 'tracking summary: private RPC grants changed';
    end if;
end;
$security$;

rollback;
