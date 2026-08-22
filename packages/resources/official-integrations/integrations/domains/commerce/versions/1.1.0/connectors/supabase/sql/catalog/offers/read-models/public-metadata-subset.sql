

create or replace function commerce.public_metadata_subset(
    p_metadata jsonb,
    p_keys text[]
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    from jsonb_each(coalesce(p_metadata, '{}'::jsonb)) entry
    where entry.key = any(coalesce(p_keys, array[]::text[]));
$$;