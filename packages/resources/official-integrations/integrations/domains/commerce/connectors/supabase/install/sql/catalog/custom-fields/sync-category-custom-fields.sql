

create or replace function commerce.sync_category_custom_fields(
    p_category_id bigint,
    p_fields jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_fields jsonb := coalesce(p_fields, '[]'::jsonb);
    v_field jsonb;
    v_field_key text;
    v_field_keys text[];
    v_enabled_fields jsonb;
    v_required boolean;
    v_filterable boolean;
    v_position integer;
    v_category_locked boolean := false;
    v_count integer;
    v_distinct_count integer;
begin
    if jsonb_typeof(v_fields) <> 'array' then
        raise exception 'validation: category fields must be an array';
    end if;
    if jsonb_array_length(v_fields) > 100 then
        raise exception 'validation: too many category fields';
    end if;
    select count(*), count(distinct field->>'fieldKey'),
           coalesce(array_agg(field->>'fieldKey'), array[]::text[])
    into v_count, v_distinct_count, v_field_keys
    from jsonb_array_elements(v_fields) field;
    if v_count <> v_distinct_count then
        raise exception 'validation: category field keys must be unique';
    end if;

    select coalesce(jsonb_object_agg(definition.key, true), '{}'::jsonb)
    into v_enabled_fields
    from commerce.custom_field_definitions definition
    where definition.entity_type = 'product' and definition.enabled;

    -- Preserve the first validation error in input order before the set-based write.
    for v_field in select value from jsonb_array_elements(v_fields) loop
        v_field_key := v_field->>'fieldKey';
        v_required := coalesce((v_field->>'required')::boolean, false);
        v_filterable := coalesce((v_field->>'filterable')::boolean, false);
        v_position := coalesce(nullif(v_field->>'position', '')::integer, 0);
        if not (v_enabled_fields ? v_field_key) then
            raise exception 'validation: enabled Product custom field does not exist';
        end if;
        if not v_category_locked then
            perform 1 from commerce.categories where id = p_category_id for update;
            if not found then raise exception 'validation: category does not exist'; end if;
            v_category_locked := true;
        end if;
    end loop;

    if not v_category_locked then
        perform 1 from commerce.categories where id = p_category_id for update;
    end if;

    insert into commerce.category_custom_fields (
        category_id, entity_type, field_key, required, filterable, position, unit, operators
    )
    select p_category_id, 'product', field->>'fieldKey',
           coalesce((field->>'required')::boolean, false),
           coalesce((field->>'filterable')::boolean, false),
           coalesce(nullif(field->>'position', '')::integer, 0), null, '[]'::jsonb
    from jsonb_array_elements(v_fields) field
    on conflict (category_id, field_key) do update
    set required = excluded.required,
        filterable = excluded.filterable,
        position = excluded.position,
        unit = null,
        operators = '[]'::jsonb;

    delete from commerce.category_custom_fields existing
    where existing.category_id = p_category_id
      and not (existing.field_key = any(v_field_keys));
    return commerce.category_custom_field_schema(p_category_id);
end;
$$;