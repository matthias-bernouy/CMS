export const SUPABASE_SCHEMA_NAMESPACE_QUERY = `
select namespace.nspname::text as namespace_name
from pg_catalog.pg_namespace as namespace
where namespace.nspname = any($1::text[])
order by namespace.nspname collate "C"
`;

export const SUPABASE_SCHEMA_RELATION_QUERY = `
select
    namespace.nspname::text as namespace_name,
    relation.relname::text as relation_name,
    relation.relkind::text as relation_kind
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
where namespace.nspname = any($1::text[])
  and relation.relkind in ('r', 'p', 'v', 'm', 'f')
  and not relation.relispartition
order by
    namespace.nspname collate "C",
    relation.relname collate "C"
`;

export const SUPABASE_SCHEMA_COLUMN_QUERY = `
select
    namespace.nspname::text as namespace_name,
    relation.relname::text as relation_name,
    attribute.attname::text as column_name,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as formatted_type,
    not attribute.attnotnull as nullable,
    pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, false) as default_expression,
    attribute.attidentity::text as identity_code,
    attribute.attgenerated::text as generated_code,
    sequence_dependency.deptype::text as sequence_dependency_code
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = relation.oid
left join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = attribute.attrelid
   and default_value.adnum = attribute.attnum
left join (
    pg_catalog.pg_depend as sequence_dependency
    join pg_catalog.pg_class as sequence_relation
        on sequence_relation.oid = sequence_dependency.objid
       and sequence_relation.relkind = 'S'
) on sequence_dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
   and sequence_dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
   and sequence_dependency.refobjid = relation.oid
   and sequence_dependency.refobjsubid = attribute.attnum
   and sequence_dependency.deptype in ('a', 'i')
where namespace.nspname = any($1::text[])
  and relation.relkind in ('r', 'p', 'v', 'm', 'f')
  and not relation.relispartition
  and attribute.attnum > 0
  and not attribute.attisdropped
order by
    namespace.nspname collate "C",
    relation.relname collate "C",
    attribute.attname collate "C",
    sequence_dependency.deptype::text collate "C"
`;

export const SUPABASE_SCHEMA_CONSTRAINT_QUERY = `
select
    namespace.nspname::text as namespace_name,
    relation.relname::text as relation_name,
    constraint_row.conname::text as constraint_name,
    constraint_row.contype::text as constraint_type,
    constraint_row.condeferrable as deferrable,
    constraint_row.condeferred as initially_deferred,
    constraint_row.convalidated as validated,
    array(
        select local_attribute.attname::text
        from pg_catalog.unnest(constraint_row.conkey) with ordinality as local_key(attnum, position)
        join pg_catalog.pg_attribute as local_attribute
            on local_attribute.attrelid = constraint_row.conrelid
           and local_attribute.attnum = local_key.attnum
        order by local_key.position
    ) as local_columns,
    referenced_namespace.nspname::text as referenced_namespace_name,
    referenced_relation.relname::text as referenced_relation_name,
    array(
        select referenced_attribute.attname::text
        from pg_catalog.unnest(constraint_row.confkey) with ordinality as referenced_key(attnum, position)
        join pg_catalog.pg_attribute as referenced_attribute
            on referenced_attribute.attrelid = constraint_row.confrelid
           and referenced_attribute.attnum = referenced_key.attnum
        order by referenced_key.position
    ) as referenced_columns,
    case when constraint_row.contype = 'f' then constraint_row.confupdtype::text end as update_action_code,
    case when constraint_row.contype = 'f' then constraint_row.confdeltype::text end as delete_action_code,
    case when constraint_row.contype = 'f' then constraint_row.confmatchtype::text end as match_type_code,
    case when constraint_row.contype = 'u' then supporting_index.indnullsnotdistinct end as nulls_not_distinct,
    case
        when constraint_row.contype = 'c'
        then pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid, false)
    end as check_expression
from pg_catalog.pg_constraint as constraint_row
join pg_catalog.pg_class as relation
    on relation.oid = constraint_row.conrelid
join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
left join pg_catalog.pg_class as referenced_relation
    on referenced_relation.oid = constraint_row.confrelid
left join pg_catalog.pg_namespace as referenced_namespace
    on referenced_namespace.oid = referenced_relation.relnamespace
left join pg_catalog.pg_index as supporting_index
    on supporting_index.indexrelid = constraint_row.conindid
where namespace.nspname = any($1::text[])
  and relation.relkind in ('r', 'p', 'f')
  and not relation.relispartition
  and constraint_row.contype in ('p', 'u', 'f', 'c')
  and constraint_row.conparentid = 0
order by
    namespace.nspname collate "C",
    relation.relname collate "C",
    constraint_row.conname collate "C"
`;
