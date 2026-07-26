const USER_NAMESPACE = `namespace.nspname !~ '^pg_' and namespace.nspname not in
    ('information_schema', 'cms_verifier_guard', 'extensions')`;

export const BOUNDARY_CATALOG_QUERY = `
with user_namespaces as (
    select namespace.oid, namespace.nspname
    from pg_catalog.pg_namespace as namespace
    where ${USER_NAMESPACE}
      and not (namespace.nspname = any($1::text[]))
), catalog_rows as (
    select 'namespace'::text as "objectType", namespace.nspname::text as namespace,
           namespace.nspname::text as object_identity,
           concat(pg_catalog.pg_get_userbyid(namespace.nspowner), chr(31), coalesce(namespace.nspacl::text, '')) as definition
    from pg_catalog.pg_namespace as namespace join user_namespaces on user_namespaces.oid = namespace.oid
    union all
    select 'relation', namespace.nspname, relation.relname,
           concat(relation.relkind::text, chr(31), pg_catalog.pg_get_userbyid(relation.relowner), chr(31),
                  relation.relrowsecurity::text, chr(31), relation.relforcerowsecurity::text, chr(31),
                  coalesce(relation.reloptions::text, ''), chr(31), coalesce(relation.relacl::text, ''))
    from pg_catalog.pg_class as relation join user_namespaces as namespace on namespace.oid = relation.relnamespace
    where relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    union all
    select 'column', namespace.nspname, concat(relation.relname, '.', attribute.attname),
           concat(pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), chr(31), attribute.attnotnull::text,
                  chr(31), attribute.attidentity::text, chr(31), attribute.attgenerated::text, chr(31),
                  coalesce(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, false), ''))
    from pg_catalog.pg_class as relation join user_namespaces as namespace on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute as attribute on attribute.attrelid = relation.oid
    left join pg_catalog.pg_attrdef as default_value on default_value.adrelid = relation.oid and default_value.adnum = attribute.attnum
    where attribute.attnum > 0 and not attribute.attisdropped
    union all
    select 'constraint', namespace.nspname, concat(relation.relname, '.', constraint_row.conname),
           pg_catalog.pg_get_constraintdef(constraint_row.oid, false)
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join user_namespaces as namespace on namespace.oid = relation.relnamespace
    union all
    select 'index', namespace.nspname, index_relation.relname, pg_catalog.pg_get_indexdef(index_relation.oid)
    from pg_catalog.pg_class as index_relation join user_namespaces as namespace on namespace.oid = index_relation.relnamespace
    where index_relation.relkind = 'i'
    union all
    select 'policy', namespace.nspname, concat(relation.relname, '.', policy.polname),
           concat(policy.polcmd::text, chr(31), policy.polpermissive::text, chr(31), policy.polroles::text, chr(31),
                  coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false), ''), chr(31),
                  coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false), ''))
    from pg_catalog.pg_policy as policy join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join user_namespaces as namespace on namespace.oid = relation.relnamespace
    union all
    select 'routine', namespace.nspname,
           concat(procedure.proname, '(', pg_catalog.pg_get_function_identity_arguments(procedure.oid), ')'),
           concat(md5(pg_catalog.pg_get_functiondef(procedure.oid)), chr(31), procedure.prosecdef::text, chr(31),
                  coalesce(procedure.proconfig::text, ''), chr(31), coalesce(procedure.proacl::text, ''))
    from pg_catalog.pg_proc as procedure join user_namespaces as namespace on namespace.oid = procedure.pronamespace
    union all
    select 'trigger', namespace.nspname, concat(relation.relname, '.', trigger.tgname),
           pg_catalog.pg_get_triggerdef(trigger.oid, false)
    from pg_catalog.pg_trigger as trigger join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join user_namespaces as namespace on namespace.oid = relation.relnamespace where not trigger.tgisinternal
    union all
    select 'type', namespace.nspname, type_row.typname,
           concat(type_row.typtype::text, chr(31), coalesce(string_agg(enum.enumlabel, chr(30) order by enum.enumsortorder), ''))
    from pg_catalog.pg_type as type_row join user_namespaces as namespace on namespace.oid = type_row.typnamespace
    left join pg_catalog.pg_enum as enum on enum.enumtypid = type_row.oid
    group by namespace.nspname, type_row.typname, type_row.typtype
)
select "objectType", namespace, object_identity as "identity", definition from catalog_rows
order by "objectType" collate "C", namespace collate "C", object_identity collate "C"`;

export const RLS_RELATIONS_QUERY = `
select namespace.nspname::text as namespace, relation.relname::text as relation,
       case relation.relkind when 'r' then 'table' else 'partitioned-table' end as kind,
       relation.relrowsecurity as "rlsEnabled", relation.relforcerowsecurity as "rlsForced"
from pg_catalog.pg_class as relation join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = any($1::text[]) and relation.relkind in ('r', 'p') and not relation.relispartition
order by namespace.nspname collate "C", relation.relname collate "C"`;

export const RLS_POLICIES_QUERY = `
select namespace.nspname::text as namespace, relation.relname::text as relation, policy.polname::text as name,
       policy.polcmd::text as command, policy.polpermissive as permissive,
       array(select case role_oid when 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(role_oid) end
             from pg_catalog.unnest(policy.polroles) as role_oid order by 1) as roles,
       pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) as "usingExpression",
       pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false) as "checkExpression"
from pg_catalog.pg_policy as policy join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = any($1::text[])
order by namespace.nspname collate "C", relation.relname collate "C", policy.polname collate "C"`;

export const GRANTS_QUERY = `
select object_type as "objectType", namespace, object_name as "objectName",
       grantee, privilege, grantable as "grantable"
from (
    select 'schema'::text as object_type, namespace.nspname::text as namespace,
           namespace.nspname::text as object_name,
           case acl.grantee when 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
           acl.privilege_type::text as privilege, acl.is_grantable as grantable
    from pg_catalog.pg_namespace as namespace
    cross join lateral pg_catalog.aclexplode(coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) as acl
    where namespace.nspname = any($1::text[])
    union all
    select 'relation', namespace.nspname, relation.relname,
           case acl.grantee when 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
           acl.privilege_type::text, acl.is_grantable
    from pg_catalog.pg_class as relation join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl,
        pg_catalog.acldefault(case when relation.relkind = 'S' then 's' else 'r' end::"char", relation.relowner))) as acl
    where namespace.nspname = any($1::text[]) and relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    union all
    select 'routine', namespace.nspname,
           concat(procedure.proname, '(', pg_catalog.pg_get_function_identity_arguments(procedure.oid), ')'),
           case acl.grantee when 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
           acl.privilege_type::text, acl.is_grantable
    from pg_catalog.pg_proc as procedure join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) as acl
    where namespace.nspname = any($1::text[])
) as grants
order by object_type collate "C", namespace collate "C", object_name collate "C", grantee collate "C", privilege collate "C"`;

export const VIEWS_QUERY = `
select namespace.nspname::text as namespace, relation.relname::text as name,
       case relation.relkind when 'v' then 'view' else 'materialized-view' end as kind,
       coalesce('security_invoker=true' = any(relation.reloptions), false) as "securityInvoker",
       array(select distinct case acl.grantee when 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end
             from pg_catalog.aclexplode(coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) as acl
             where acl.privilege_type = 'SELECT' order by 1) as "selectGrantees"
from pg_catalog.pg_class as relation join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = any($1::text[]) and relation.relkind in ('v', 'm')
order by namespace.nspname collate "C", relation.relname collate "C"`;

export const ROUTINES_QUERY = `
select namespace.nspname::text as namespace,
       concat(procedure.proname, '(', pg_catalog.pg_get_function_identity_arguments(procedure.oid), ')') as "identity",
       procedure.prosecdef as "securityDefiner", coalesce(procedure.proconfig, array[]::text[]) as configuration,
       array(select distinct case acl.grantee when 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end
             from pg_catalog.aclexplode(coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) as acl
             where acl.privilege_type = 'EXECUTE' order by 1) as "executeGrantees"
from pg_catalog.pg_proc as procedure join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = any($1::text[])
order by namespace.nspname collate "C", procedure.proname collate "C",
         pg_catalog.pg_get_function_identity_arguments(procedure.oid) collate "C"`;
