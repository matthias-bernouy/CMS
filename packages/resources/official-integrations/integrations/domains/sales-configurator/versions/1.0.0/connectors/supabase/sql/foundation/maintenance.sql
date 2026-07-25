create or replace function sales_configurator.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = pg_catalog.clock_timestamp();
    return new;
end;
$$;

create or replace function sales_configurator.require_json_object(
    p_value jsonb,
    p_name text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
    if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object' then
        raise exception 'validation: % must be an object', p_name;
    end if;
    return p_value;
end;
$$;

create or replace function sales_configurator.require_bounded_text(
    p_value text,
    p_name text,
    p_max_length integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_value text := nullif(pg_catalog.btrim(p_value), '');
begin
    if v_value is null then
        raise exception 'validation: % is required', p_name;
    end if;
    if pg_catalog.length(v_value) > p_max_length then
        raise exception 'validation: % is too long', p_name;
    end if;
    return v_value;
end;
$$;

create or replace function sales_configurator.optional_bounded_text(
    p_value text,
    p_name text,
    p_max_length integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_value text := nullif(pg_catalog.btrim(p_value), '');
begin
    if v_value is not null and pg_catalog.length(v_value) > p_max_length then
        raise exception 'validation: % is too long', p_name;
    end if;
    return v_value;
end;
$$;

create or replace function sales_configurator.json_alias_text(
    p_payload jsonb,
    p_camel_key text,
    p_snake_key text
)
returns text
language sql
immutable
set search_path = ''
as $$
    select coalesce(
        p_payload ->> p_camel_key,
        p_payload ->> p_snake_key
    )
$$;

create or replace function sales_configurator.json_has_alias(
    p_payload jsonb,
    p_camel_key text,
    p_snake_key text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select p_payload ? p_camel_key or p_payload ? p_snake_key
$$;
