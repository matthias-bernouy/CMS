do $$
declare
    v_unprotected_tables text[];
    v_exposed_privileges text[];
begin
    select pg_catalog.array_agg(table_state.relname order by table_state.relname)
    into v_unprotected_tables
    from pg_catalog.pg_class table_state
    join pg_catalog.pg_namespace namespace
      on namespace.oid = table_state.relnamespace
    where namespace.nspname = 'sales_configurator'
      and table_state.relkind in ('r', 'p')
      and (not table_state.relrowsecurity or not table_state.relforcerowsecurity);

    if pg_catalog.cardinality(v_unprotected_tables) > 0 then
        raise exception
            'invariant: sales_configurator tables without forced RLS: %',
            v_unprotected_tables;
    end if;

    with untrusted_privileges as (
        select
            privilege.grantee,
            'table:' || privilege.table_name as object_name,
            privilege.privilege_type
        from information_schema.table_privileges privilege
        where privilege.table_schema = 'sales_configurator'
          and privilege.grantee in ('PUBLIC', 'anon', 'authenticated')
        union all
        select
            privilege.grantee,
            'routine:' || privilege.routine_name,
            privilege.privilege_type
        from information_schema.routine_privileges privilege
        where privilege.routine_schema = 'sales_configurator'
          and privilege.grantee in ('PUBLIC', 'anon', 'authenticated')
        union all
        select
            privilege.grantee,
            'sequence:' || privilege.object_name,
            privilege.privilege_type
        from information_schema.usage_privileges privilege
        where privilege.object_schema = 'sales_configurator'
          and privilege.object_type = 'SEQUENCE'
          and privilege.grantee in ('PUBLIC', 'anon', 'authenticated')
        union all
        select
            case when acl.grantee = 0 then 'PUBLIC' else role.rolname end,
            'schema:sales_configurator',
            acl.privilege_type
        from pg_catalog.pg_namespace namespace
        cross join lateral pg_catalog.aclexplode(
            coalesce(
                namespace.nspacl,
                pg_catalog.acldefault('n', namespace.nspowner)
            )
        ) acl
        left join pg_catalog.pg_roles role on role.oid = acl.grantee
        where namespace.nspname = 'sales_configurator'
          and (
            acl.grantee = 0
            or role.rolname in ('anon', 'authenticated')
          )
    )
    select pg_catalog.array_agg(
        privilege.grantee || ':' || privilege.object_name || ':' || privilege.privilege_type
        order by privilege.grantee, privilege.object_name, privilege.privilege_type
    )
    into v_exposed_privileges
    from untrusted_privileges privilege;

    if pg_catalog.cardinality(v_exposed_privileges) > 0 then
        raise exception
            'invariant: untrusted sales_configurator privileges: %',
            v_exposed_privileges;
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'sales_configurator.proposal_items',
        'UPDATE'
    ) or pg_catalog.has_table_privilege(
        'service_role',
        'sales_configurator.proposal_events',
        'UPDATE'
    ) or pg_catalog.has_table_privilege(
        'service_role',
        'sales_configurator.proposal_events',
        'DELETE'
    ) then
        raise exception 'invariant: service_role has unsafe snapshot or event mutation privileges';
    end if;

    if pg_catalog.has_function_privilege(
        'service_role',
        'sales_configurator.protect_proposal_event()',
        'EXECUTE'
    ) or pg_catalog.has_function_privilege(
        'service_role',
        'sales_configurator.protect_partner_cms_user_id()',
        'EXECUTE'
    ) or pg_catalog.has_function_privilege(
        'service_role',
        'sales_configurator.protect_owner_cms_user_id()',
        'EXECUTE'
    ) then
        raise exception 'invariant: service_role can invoke internal protection triggers';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_attribute attribute
        join pg_catalog.pg_class table_state on table_state.oid = attribute.attrelid
        join pg_catalog.pg_namespace namespace on namespace.oid = table_state.relnamespace
        where namespace.nspname = 'sales_configurator'
          and table_state.relname = 'proposal_versions'
          and attribute.attname = 'revision'
          and attribute.attnum > 0
          and not attribute.attisdropped
          and attribute.attnotnull
    ) then
        raise exception 'invariant: proposal version revision is missing or nullable';
    end if;

    if pg_catalog.to_regprocedure(
        'sales_configurator.publish_partner_proposal(text,bigint,bigint,bigint)'
    ) is null or pg_catalog.to_regprocedure(
        'sales_configurator.publish_partner_proposal(text,bigint,bigint)'
    ) is not null then
        raise exception 'invariant: optimistic publish signature is not exact';
    end if;
end;
$$;
