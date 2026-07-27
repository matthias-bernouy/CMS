drop schema if exists commerce cascade;

do $roles$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end;
$roles$;

\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

grant usage on schema extensions to service_role;
grant execute on all functions in schema extensions to service_role;

do $installation_contract$
declare
    v_table text;
    v_function text;
begin
    foreach v_table in array array[
        'marketplace_service_withdrawal_requests',
        'marketplace_service_withdrawal_events'
    ]
    loop
        if not exists (
            select 1
            from pg_class relation
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'commerce'
              and relation.relname = v_table
              and relation.relrowsecurity
              and relation.relforcerowsecurity
        ) then
            raise exception 'service withdrawal RLS is incomplete on %', v_table;
        end if;
        if has_table_privilege('anon', 'commerce.' || v_table, 'select')
            or has_table_privilege('authenticated', 'commerce.' || v_table, 'select') then
            raise exception 'service withdrawal table leaked to a public Data API role: %', v_table;
        end if;
    end loop;

    foreach v_function in array array[
        'commerce.marketplace_service_withdrawal_request_read_model(bigint)',
        'commerce.list_marketplace_service_withdrawal_requests(text,text,uuid,bigint,text,text,integer,integer)',
        'commerce.submit_marketplace_service_withdrawal_request(bigint,text,text,text,boolean,text)',
        'commerce.review_marketplace_service_withdrawal_request(uuid,text,text,text,text,integer)'
    ]
    loop
        if to_regprocedure(v_function) is null then
            raise exception 'service withdrawal function is missing: %', v_function;
        end if;
    end loop;

    if exists (
        select 1
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname like '%service_withdrawal%'
          and (
              procedure.prosecdef
              or not coalesce(procedure.proconfig @> array['search_path=""'], false)
          )
    ) then
        raise exception 'service withdrawal functions must be invoker-safe with an empty search path';
    end if;
    if has_table_privilege('service_role', 'commerce.marketplace_service_withdrawal_requests', 'delete')
        or has_table_privilege('service_role', 'commerce.marketplace_service_withdrawal_events', 'update')
        or has_table_privilege('service_role', 'commerce.marketplace_service_withdrawal_events', 'delete') then
        raise exception 'service withdrawal evidence has destructive service-role privileges';
    end if;
end;
$installation_contract$;
