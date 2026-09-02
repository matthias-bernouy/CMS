do $private_cache_security$
declare
    v_private_tables text[] := array[
        'commerce.platform_payout_order_contributions',
        'commerce.platform_payout_liability_pending_orders',
        'commerce.platform_payout_liability_cache_state'
    ];
begin
    if (select count(*)
        from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'commerce'
          and relation.relname = any(array[
              'platform_payout_order_contributions',
              'platform_payout_liability_pending_orders',
              'platform_payout_liability_cache_state'
          ])
          and relation.relrowsecurity
          and relation.relforcerowsecurity) <> 3 then
        raise exception 'platform liability: private cache RLS is incomplete';
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'commerce'
          and relation.relname = 'platform_payout_order_contribution_projection'
          and relation.relkind = 'v'
          and relation.reloptions @> array['security_invoker=true']
    )
       or not pg_catalog.has_table_privilege(
            'service_role',
            'commerce.platform_payout_order_contribution_projection', 'SELECT'
        )
       or pg_catalog.has_table_privilege(
            'anon', 'commerce.platform_payout_order_contribution_projection', 'SELECT'
        )
       or pg_catalog.has_table_privilege(
            'authenticated',
            'commerce.platform_payout_order_contribution_projection', 'SELECT'
        ) then
        raise exception 'platform liability: live projection boundary changed';
    end if;
    if exists (
        select 1
        from unnest(array['anon', 'authenticated']) role_name
        cross join unnest(v_private_tables) table_name
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
        where pg_catalog.has_table_privilege(
            role_name, table_name, privilege_name
        )
    ) then
        raise exception 'platform liability: browser role can access private cache tables';
    end if;
    if not pg_catalog.has_table_privilege('service_role', v_private_tables[1], 'SELECT')
       or not pg_catalog.has_table_privilege('service_role', v_private_tables[1], 'INSERT')
       or not pg_catalog.has_table_privilege('service_role', v_private_tables[1], 'UPDATE')
       or pg_catalog.has_table_privilege(
            'service_role', v_private_tables[1], 'DELETE'
        )
       or not pg_catalog.has_table_privilege('service_role', v_private_tables[2], 'SELECT')
       or not pg_catalog.has_table_privilege('service_role', v_private_tables[2], 'INSERT')
       or not pg_catalog.has_table_privilege('service_role', v_private_tables[2], 'DELETE')
       or pg_catalog.has_table_privilege(
            'service_role', v_private_tables[2], 'UPDATE'
        )
       or not pg_catalog.has_table_privilege('service_role', v_private_tables[3], 'SELECT')
       or not pg_catalog.has_table_privilege('service_role', v_private_tables[3], 'UPDATE')
       or pg_catalog.has_table_privilege('service_role', v_private_tables[3], 'INSERT')
       or pg_catalog.has_table_privilege('service_role', v_private_tables[3], 'DELETE') then
        raise exception 'platform liability: service cache privileges are not least-privilege';
    end if;
end;
$private_cache_security$;

do $private_cache_functions$
declare
    v_function_oids oid[];
begin
    select array_agg(procedure.oid order by procedure.oid)
    into v_function_oids
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'commerce'
      and procedure.proname = any(array[
          'platform_payout_order_contribution_rows',
          'apply_platform_payout_liability_total',
          'refresh_platform_payout_liability',
          'refresh_platform_payout_liability_delta',
          'queue_platform_payout_liability_order',
          'collect_order_platform_payout_liability',
          'flush_platform_payout_liability_statement'
      ]);
    if cardinality(v_function_oids) <> 7
       or exists (
           select 1 from pg_catalog.pg_proc procedure
           where procedure.oid = any(v_function_oids)
             and (procedure.prosecdef
                or not coalesce(
                    procedure.proconfig @> array['search_path=""'], false
                )
                or (procedure.proname = 'platform_payout_order_contribution_rows'
                    and procedure.provolatile <> 's')
                or (procedure.proname <> 'platform_payout_order_contribution_rows'
                    and procedure.provolatile <> 'v'))
       )
       or exists (
           select 1 from unnest(v_function_oids) function_oid
           where not pg_catalog.has_function_privilege(
                    'service_role', function_oid, 'EXECUTE'
                )
              or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
              or pg_catalog.has_function_privilege(
                    'authenticated', function_oid, 'EXECUTE'
                )
       ) then
        raise exception 'platform liability: private helper function boundary changed';
    end if;
end;
$private_cache_functions$;
