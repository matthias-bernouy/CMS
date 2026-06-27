# Supabase Gateway Import

The official Supabase import creates a gateway provider from the project's
OpenAPI schema and stores the submitted API key as a CMS secret. Imported
endpoints receive injected `apikey` and `authorization` headers that read from
that secret at execution time.

RPC response fields are enriched only when the Supabase project exposes the
optional metadata function below.

## Import Steps

1. In Supabase, open the SQL editor and install `cms_gateway_rpc_output_shapes`
   in the same exposed schema you import, usually `api`, with the SQL below.
2. In the CMS admin, open `Gateway` -> `New provider` -> `Official` -> `Supabase`.
3. Enter the project URL, for example `https://project-ref.supabase.co`.
4. Set `Data API schema` to the exposed schema that contains your RPC functions,
   usually `api`.
5. Enter a service role key or another secret key allowed to read the OpenAPI
   schema. Publishable and anon keys should not be used for the import.
6. Submit `Connect Supabase`.

If the provider already exists, delete it first or import with a new identifier.
Existing providers are not automatically resynced when the metadata function is
added later.

If the metadata function is missing from the exposed schema, the import still
works, but `/rpc/*` endpoints keep the response shape exposed by Supabase
OpenAPI, which is often empty or generic for functions.

For non-`public` schemas, the import stores `accept-profile` and
`content-profile` headers on every endpoint so Delivery calls the same Supabase
schema that was imported.

## Metadata Function

```sql
create or replace function api.cms_gateway_rpc_output_shapes(
    p_schemas text[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with functions as (
    select
        p.oid,
        n.nspname as schema_name,
        p.proname as function_name,
        pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
        pg_catalog.pg_get_function_result(p.oid) as result,
        p.proretset as returns_set,
        rn.nspname as return_type_schema,
        rt.typname as return_type_name,
        rt.typtype as return_type_kind,
        rt.typcategory as return_type_category,
        pg_catalog.format_type(p.prorettype, null) as return_data_type
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_type rt on rt.oid = p.prorettype
    join pg_catalog.pg_namespace rn on rn.oid = rt.typnamespace
    where p.prokind = 'f'
      and n.nspname not in ('pg_catalog', 'information_schema')
      and n.nspname not like 'pg_toast%'
      and p.proname <> 'cms_gateway_rpc_output_shapes'
      and (p_schemas is null or n.nspname = any(p_schemas))
),
out_arg_fields as (
    select
        f.oid as function_oid,
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'name', arg.name,
                'dataType', pg_catalog.format_type(arg.type_oid, null),
                'typeSchema', tn.nspname,
                'typeName', t.typname,
                'typeKind', t.typtype,
                'typeCategory', t.typcategory,
                'element', case when et.oid is null then null else
                    pg_catalog.jsonb_build_object(
                        'dataType', pg_catalog.format_type(et.oid, null),
                        'typeSchema', etn.nspname,
                        'typeName', et.typname,
                        'typeKind', et.typtype,
                        'typeCategory', et.typcategory,
                        'fields', element_fields.fields
                    )
                end,
                'fields', direct_fields.fields
            )
            order by arg.ordinality
        ) as fields
    from functions f
    join pg_catalog.pg_proc p on p.oid = f.oid
    cross join lateral (
        select
            p.proallargtypes[s.i] as type_oid,
            p.proargmodes[s.i] as mode,
            coalesce(p.proargnames[s.i]::text, 'column_' || s.i::text) as name,
            s.i as ordinality
        from pg_catalog.generate_subscripts(p.proallargtypes, 1) as s(i)
    ) arg
    join pg_catalog.pg_type t on t.oid = arg.type_oid
    join pg_catalog.pg_namespace tn on tn.oid = t.typnamespace
    left join pg_catalog.pg_type et on t.typcategory = 'A' and t.typelem = et.oid and t.typelem <> 0
    left join pg_catalog.pg_namespace etn on etn.oid = et.typnamespace
    left join lateral (
        select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'name', a.attname,
                'dataType', pg_catalog.format_type(a.atttypid, a.atttypmod),
                'typeSchema', atn.nspname,
                'typeName', at.typname,
                'typeKind', at.typtype,
                'typeCategory', at.typcategory
            )
            order by a.attnum
        ) as fields
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_type at on at.oid = a.atttypid
        join pg_catalog.pg_namespace atn on atn.oid = at.typnamespace
        where t.typtype = 'c'
          and a.attrelid = t.typrelid
          and a.attnum > 0
          and not a.attisdropped
    ) direct_fields on true
    left join lateral (
        select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'name', a.attname,
                'dataType', pg_catalog.format_type(a.atttypid, a.atttypmod),
                'typeSchema', atn.nspname,
                'typeName', at.typname,
                'typeKind', at.typtype,
                'typeCategory', at.typcategory
            )
            order by a.attnum
        ) as fields
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_type at on at.oid = a.atttypid
        join pg_catalog.pg_namespace atn on atn.oid = at.typnamespace
        where et.typtype = 'c'
          and a.attrelid = et.typrelid
          and a.attnum > 0
          and not a.attisdropped
    ) element_fields on true
    where arg.mode in ('o', 'b', 't')
    group by f.oid
),
return_fields as (
    select
        f.oid as function_oid,
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'name', a.attname,
                'dataType', pg_catalog.format_type(a.atttypid, a.atttypmod),
                'typeSchema', atn.nspname,
                'typeName', at.typname,
                'typeKind', at.typtype,
                'typeCategory', at.typcategory
            )
            order by a.attnum
        ) as fields
    from functions f
    join pg_catalog.pg_type rt on rt.typname = f.return_type_name
    join pg_catalog.pg_namespace rn on rn.nspname = f.return_type_schema and rn.oid = rt.typnamespace
    join pg_catalog.pg_attribute a on a.attrelid = rt.typrelid
    join pg_catalog.pg_type at on at.oid = a.atttypid
    join pg_catalog.pg_namespace atn on atn.oid = at.typnamespace
    where f.return_type_kind = 'c'
      and a.attnum > 0
      and not a.attisdropped
    group by f.oid
)
select pg_catalog.jsonb_build_object(
    'functions',
    coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'schema', f.schema_name,
                'name', f.function_name,
                'arguments', f.arguments,
                'result', f.result,
                'returnsSet', f.returns_set,
                'returnType', pg_catalog.jsonb_build_object(
                    'dataType', f.return_data_type,
                    'typeSchema', f.return_type_schema,
                    'typeName', f.return_type_name,
                    'typeKind', f.return_type_kind,
                    'typeCategory', f.return_type_category
                ),
                'fields', coalesce(af.fields, rf.fields, '[]'::jsonb)
            )
            order by f.schema_name, f.function_name, f.arguments
        ),
        '[]'::jsonb
    )
)
from functions f
left join out_arg_fields af on af.function_oid = f.oid
left join return_fields rf on rf.function_oid = f.oid;
$$;

revoke execute on function api.cms_gateway_rpc_output_shapes(text[]) from public;
revoke execute on function api.cms_gateway_rpc_output_shapes(text[]) from anon;
revoke execute on function api.cms_gateway_rpc_output_shapes(text[]) from authenticated;
grant execute on function api.cms_gateway_rpc_output_shapes(text[]) to service_role;
```

To verify the function:

```sql
select api.cms_gateway_rpc_output_shapes(null);
```
