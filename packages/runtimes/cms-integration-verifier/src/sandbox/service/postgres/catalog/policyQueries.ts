export const RLS_RELATIONS_QUERY = `
with actors(role_name) as (values ('anon'::text), ('authenticated'::text))
select namespace.nspname::text as namespace, relation.relname::text as relation,
       case relation.relkind when 'r' then 'table' else 'partitioned-table' end as kind,
       relation.relrowsecurity as "rlsEnabled", relation.relforcerowsecurity as "rlsForced",
       array(select actor.role_name from actors actor
         where pg_catalog.has_schema_privilege(actor.role_name, namespace.oid, 'USAGE')
           and (pg_catalog.has_table_privilege(
                  actor.role_name, relation.oid, 'SELECT, INSERT, UPDATE, DELETE'
                ) or exists (
                  select from pg_catalog.pg_attribute attribute
                  where attribute.attrelid = relation.oid and attribute.attnum > 0
                    and not attribute.attisdropped and (
                      pg_catalog.has_column_privilege(actor.role_name, relation.oid, attribute.attnum, 'SELECT') or
                      pg_catalog.has_column_privilege(actor.role_name, relation.oid, attribute.attnum, 'INSERT') or
                      pg_catalog.has_column_privilege(actor.role_name, relation.oid, attribute.attnum, 'UPDATE')
                    )
                )) order by actor.role_name collate "C") as "exposedRoles"
from pg_catalog.pg_class relation
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = any($1::text[]) and relation.relkind in ('r', 'p') and not relation.relispartition
order by namespace.nspname collate "C", relation.relname collate "C"`;

export const RLS_POLICIES_QUERY = `
select namespace.nspname::text as namespace, relation.relname::text as relation, policy.polname::text as name,
       policy.polcmd::text as command, policy.polpermissive as permissive,
       array(select case role_oid when 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(role_oid) end
             from pg_catalog.unnest(policy.polroles) role_oid order by 1) as roles,
       pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) as "usingExpression",
       pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false) as "checkExpression"
from pg_catalog.pg_policy policy join pg_catalog.pg_class relation on relation.oid = policy.polrelid
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = any($1::text[])
order by namespace.nspname collate "C", relation.relname collate "C", policy.polname collate "C"`;

export const ROLE_MEMBERSHIPS_QUERY = `
with recursive role_tree(actor, role_oid, depth, visited) as (
    select actor.name, role_row.oid, 0, array[role_row.oid]
    from (values ('anon'::text), ('authenticated'::text)) actor(name)
    join pg_catalog.pg_roles role_row on role_row.rolname = actor.name
    union all
    select role_tree.actor, membership.roleid, role_tree.depth + 1,
           role_tree.visited || membership.roleid
    from role_tree join pg_catalog.pg_auth_members membership on membership.member = role_tree.role_oid
    where not membership.roleid = any(role_tree.visited)
)
select role_tree.actor, inherited.rolname::text as "inheritedRole", role_tree.depth,
       inherited.rolsuper as superuser, inherited.rolbypassrls as "bypassRls"
from role_tree join pg_catalog.pg_roles inherited on inherited.oid = role_tree.role_oid
where role_tree.depth > 0
order by role_tree.actor collate "C", role_tree.depth, inherited.rolname collate "C"`;

export const UNKNOWN_SURFACES_QUERY = `
with recursive roots(actor, role_oid) as (
    select actor.name, role_row.oid
    from (values ('anon'::text), ('authenticated'::text)) actor(name)
    join pg_catalog.pg_roles role_row on role_row.rolname = actor.name
    union
    select roots.actor, membership.roleid
    from roots join pg_catalog.pg_auth_members membership on membership.member = roots.role_oid
), unknown as (
    select namespace.nspname::text as namespace, relation.relname::text as object_name,
           relation.relkind::text as kind,
           array(select exposed.actor from (
             select distinct roots.actor from roots
             where pg_catalog.has_schema_privilege(roots.actor, namespace.oid, 'USAGE')
               and exists (
                 select from pg_catalog.aclexplode(relation.relacl) acl
                 where acl.grantee = 0 or acl.grantee = roots.role_oid
               )
           ) exposed order by exposed.actor collate "C") as exposed_roles
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = any($1::text[]) and relation.relkind not in ('r', 'p', 'v', 'm', 'f', 'S')
)
select namespace, object_name as "objectName", kind, exposed_roles as "exposedRoles"
from unknown where cardinality(exposed_roles) > 0
order by namespace collate "C", object_name collate "C"`;

export const VIEWS_QUERY = `
with actors(role_name) as (values ('anon'::text), ('authenticated'::text))
select namespace.nspname::text as namespace, relation.relname::text as name,
       case relation.relkind when 'v' then 'view' else 'materialized-view' end as kind,
       relation.relowner = (select oid from pg_catalog.pg_roles where rolname = session_user) as "ownedBySessionRole",
       coalesce('security_invoker=true' = any(relation.reloptions), false) as "securityInvoker",
       array(select actor.role_name from actors actor
         where pg_catalog.has_schema_privilege(actor.role_name, namespace.oid, 'USAGE')
           and (pg_catalog.has_table_privilege(actor.role_name, relation.oid, 'SELECT') or exists (
             select from pg_catalog.pg_attribute attribute
             where attribute.attrelid = relation.oid and attribute.attnum > 0 and not attribute.attisdropped
               and pg_catalog.has_column_privilege(actor.role_name, relation.oid, attribute.attnum, 'SELECT')
           )) order by actor.role_name collate "C") as "selectGrantees"
from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = any($1::text[]) and relation.relkind in ('v', 'm')
order by namespace.nspname collate "C", relation.relname collate "C"`;

export const ROUTINES_QUERY = `
with actors(role_name) as (values ('anon'::text), ('authenticated'::text))
select namespace.nspname::text as namespace,
       concat(procedure.proname, '(', pg_catalog.pg_get_function_identity_arguments(procedure.oid), ')') as "identity",
       procedure.proowner = (select oid from pg_catalog.pg_roles where rolname = session_user) as "ownedBySessionRole",
       procedure.prosecdef as "securityDefiner", coalesce(procedure.proconfig, array[]::text[]) as configuration,
       array(select actor.role_name from actors actor
         where pg_catalog.has_schema_privilege(actor.role_name, namespace.oid, 'USAGE')
           and pg_catalog.has_function_privilege(actor.role_name, procedure.oid, 'EXECUTE')
         order by actor.role_name collate "C") as "executeGrantees"
from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = any($1::text[])
order by namespace.nspname collate "C", procedure.proname collate "C",
         pg_catalog.pg_get_function_identity_arguments(procedure.oid) collate "C"`;
