select sales_configurator_test.assert_true(
    (
        select pg_catalog.count(*) = 14
        from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'sales_configurator'
          and relation.relkind in ('r', 'p')
          and relation.relrowsecurity
          and relation.relforcerowsecurity
    ),
    'all fourteen domain tables must have forced RLS'
);

select sales_configurator_test.assert_true(
    not pg_catalog.has_schema_privilege('anon', 'sales_configurator', 'usage')
    and not pg_catalog.has_schema_privilege('authenticated', 'sales_configurator', 'usage')
    and pg_catalog.has_schema_privilege('service_role', 'sales_configurator', 'usage'),
    'only service_role may use the private schema'
);

select sales_configurator_test.assert_true(
    not exists (
        select 1
        from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace
          on namespace.oid = relation.relnamespace
        cross join (values ('anon'), ('authenticated')) untrusted(role_name)
        where namespace.nspname = 'sales_configurator'
          and relation.relkind in ('r', 'p', 'S')
          and case
            when relation.relkind = 'S' then
                pg_catalog.has_sequence_privilege(
                    untrusted.role_name,
                    relation.oid,
                    'usage,select,update'
                )
            else pg_catalog.has_table_privilege(
                untrusted.role_name,
                relation.oid,
                'select,insert,update,delete'
            )
          end
    ),
    'anon and authenticated must have no table or sequence privileges'
);

select sales_configurator_test.assert_true(
    not exists (
        select 1
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'sales_configurator'
          and (
            procedure.proacl is null
            or pg_catalog.has_function_privilege('anon', procedure.oid, 'execute')
            or pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute')
            or exists (
                select 1
                from pg_catalog.aclexplode(procedure.proacl) privilege
                where privilege.grantee = 0
                  and privilege.privilege_type = 'EXECUTE'
            )
          )
    ),
    'untrusted roles must not execute private functions'
);

select sales_configurator_test.assert_true(
    not exists (
        select 1
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'sales_configurator'
          and (
            procedure.prosecdef
            or not coalesce(
                procedure.proconfig @> array['search_path=""'],
                false
            )
          )
    ),
    'private functions must be invoker-safe and use an empty search path'
);

select sales_configurator_test.assert_true(
    (
        select pg_catalog.bool_and(
            pg_catalog.has_function_privilege(
                'service_role',
                procedure_name::regprocedure,
                'execute'
            )
        )
        from (
            values
                ('sales_configurator.upsert_catalog_module(bigint,jsonb)'),
                ('sales_configurator.upsert_catalog_feature(bigint,jsonb)'),
                ('sales_configurator.upsert_catalog_variant(bigint,jsonb)'),
                ('sales_configurator.upsert_partner_account(bigint,text,jsonb)'),
                ('sales_configurator.set_partner_capability(bigint,text,boolean)'),
                ('sales_configurator.save_partner_client(text,bigint,jsonb)'),
                (
                    'sales_configurator.save_partner_proposal_draft('
                    'text,bigint,bigint,jsonb,jsonb,jsonb)'
                ),
                (
                    'sales_configurator.publish_partner_proposal('
                    'text,bigint,bigint,bigint)'
                ),
                (
                    'sales_configurator.create_partner_proposal_share('
                    'text,bigint,timestamp with time zone,text)'
                ),
                (
                    'sales_configurator.revoke_partner_proposal_share('
                    'text,bigint,bigint)'
                ),
                ('sales_configurator.read_shared_proposal(text)')
        ) required_rpc(procedure_name)
    ),
    'service_role must execute the supported RPC surface'
);

select sales_configurator_test.assert_true(
    (
        select pg_catalog.bool_and(
            not pg_catalog.has_function_privilege(
                'service_role',
                procedure_name::regprocedure,
                'execute'
            )
        )
        from (
            values
                ('sales_configurator.set_updated_at()'),
                ('sales_configurator.protect_partner_cms_user_id()'),
                ('sales_configurator.protect_owner_cms_user_id()'),
                ('sales_configurator.protect_proposal_version()'),
                ('sales_configurator.protect_proposal_item()'),
                ('sales_configurator.reject_proposal_item_cycle()'),
                ('sales_configurator.protect_proposal_share()'),
                ('sales_configurator.protect_proposal_event()')
        ) protection_function(procedure_name)
    ),
    'service_role must not directly execute trigger protection functions'
);

select sales_configurator_test.assert_true(
    pg_catalog.has_table_privilege(
        'service_role',
        'sales_configurator.proposals',
        'select,insert,update'
    )
    and not pg_catalog.has_table_privilege(
        'service_role',
        'sales_configurator.proposals',
        'delete'
    ),
    'service_role proposal grants must be least privilege'
);

select sales_configurator_test.assert_true(
    (
        select attribute.attnotnull
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = 'sales_configurator.proposal_versions'::regclass
          and attribute.attname = 'revision'
          and not attribute.attisdropped
    ),
    'draft revision must exist and be non-null'
);
