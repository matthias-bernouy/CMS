export const GRANTS_QUERY = `
with actors(role_name) as (values ('anon'::text), ('authenticated'::text)),
effective_grants as (
    select 'schema'::text as object_type, namespace.nspname::text as namespace,
           namespace.nspname::text as object_name, actor.role_name as grantee,
           access.privilege, pg_catalog.has_schema_privilege(
             actor.role_name, namespace.oid, access.privilege || ' WITH GRANT OPTION'
           ) as grantable
    from pg_catalog.pg_namespace namespace cross join actors actor
    cross join (values ('USAGE'::text), ('CREATE'::text)) access(privilege)
    where namespace.nspname = any($1::text[])
      and pg_catalog.has_schema_privilege(actor.role_name, namespace.oid, access.privilege)
    union all
    select 'relation', namespace.nspname, relation.relname, actor.role_name, access.privilege,
           pg_catalog.has_table_privilege(
             actor.role_name, relation.oid, access.privilege || ' WITH GRANT OPTION'
           )
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join actors actor
    cross join (values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text),
                       ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text)) access(privilege)
    where namespace.nspname = any($1::text[]) and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      and pg_catalog.has_table_privilege(actor.role_name, relation.oid, access.privilege)
    union all
    select 'column', namespace.nspname, concat(relation.relname, '.', attribute.attname),
           actor.role_name, access.privilege,
           pg_catalog.has_column_privilege(
             actor.role_name, relation.oid, attribute.attnum, access.privilege || ' WITH GRANT OPTION'
           )
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
    cross join actors actor
    cross join (values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('REFERENCES'::text)) access(privilege)
    where namespace.nspname = any($1::text[]) and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      and attribute.attnum > 0 and not attribute.attisdropped
      and pg_catalog.has_column_privilege(actor.role_name, relation.oid, attribute.attnum, access.privilege)
    union all
    select 'sequence', namespace.nspname, relation.relname, actor.role_name, access.privilege,
           pg_catalog.has_sequence_privilege(
             actor.role_name, relation.oid, access.privilege || ' WITH GRANT OPTION'
           )
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join actors actor
    cross join (values ('USAGE'::text), ('SELECT'::text), ('UPDATE'::text)) access(privilege)
    where namespace.nspname = any($1::text[]) and relation.relkind = 'S'
      and pg_catalog.has_sequence_privilege(actor.role_name, relation.oid, access.privilege)
    union all
    select 'routine', namespace.nspname,
           concat(procedure.proname, '(', pg_catalog.pg_get_function_identity_arguments(procedure.oid), ')'),
           actor.role_name, 'EXECUTE',
           pg_catalog.has_function_privilege(actor.role_name, procedure.oid, 'EXECUTE WITH GRANT OPTION')
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join actors actor
    where namespace.nspname = any($1::text[])
      and pg_catalog.has_function_privilege(actor.role_name, procedure.oid, 'EXECUTE')
), public_grants as (
    select 'schema'::text as object_type, namespace.nspname::text as namespace,
           namespace.nspname::text as object_name, 'PUBLIC'::text as grantee,
           acl.privilege_type::text as privilege, acl.is_grantable as grantable
    from pg_catalog.pg_namespace namespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
    ) acl
    where namespace.nspname = any($1::text[]) and acl.grantee = 0
    union all
    select case relation.relkind when 'S' then 'sequence' else 'relation' end,
           namespace.nspname, relation.relname, 'PUBLIC', acl.privilege_type::text, acl.is_grantable
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(
      relation.relacl,
      pg_catalog.acldefault(case relation.relkind when 'S' then 's' else 'r' end::"char", relation.relowner)
    )) acl
    where namespace.nspname = any($1::text[]) and relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and acl.grantee = 0
    union all
    select 'column', namespace.nspname, concat(relation.relname, '.', attribute.attname),
           'PUBLIC', acl.privilege_type::text, acl.is_grantable
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    where namespace.nspname = any($1::text[]) and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      and attribute.attnum > 0 and not attribute.attisdropped and acl.grantee = 0
    union all
    select 'routine', namespace.nspname,
           concat(procedure.proname, '(', pg_catalog.pg_get_function_identity_arguments(procedure.oid), ')'),
           'PUBLIC', acl.privilege_type::text, acl.is_grantable
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) acl
    where namespace.nspname = any($1::text[]) and acl.grantee = 0
)
select object_type as "objectType", namespace, object_name as "objectName",
       grantee, privilege, grantable as "grantable"
from (select * from effective_grants union all select * from public_grants) grants
order by object_type collate "C", namespace collate "C", object_name collate "C",
         grantee collate "C", privilege collate "C"`;
