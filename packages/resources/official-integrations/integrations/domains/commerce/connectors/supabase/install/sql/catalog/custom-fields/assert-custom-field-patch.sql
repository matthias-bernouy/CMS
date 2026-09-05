

create or replace function commerce.assert_custom_field_patch(
    p_entity_type text,
    p_values jsonb,
    p_actor_kind text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_key text;
    v_value jsonb;
    v_definition jsonb;
    v_definitions jsonb;
begin
    p_values := coalesce(p_values, '{}'::jsonb);
    perform pg_advisory_xact_lock_shared(hashtextextended('commerce-custom-fields:' || p_entity_type, 0));
    if jsonb_typeof(p_values) <> 'object' then
        raise exception 'validation: custom fields must be an object';
    end if;
    if pg_column_size(p_values) > 65536 then
        raise exception 'validation: custom fields exceed 64 KiB';
    end if;
    if p_actor_kind not in ('self', 'admin', 'system') then
        raise exception 'forbidden: invalid custom field actor';
    end if;
    if p_values = '{}'::jsonb then
        return;
    end if;

    select coalesce(jsonb_object_agg(
        definition.key,
        jsonb_build_object(
            'selfEditable', definition.self_editable,
            'adminEditable', definition.admin_editable,
            'fieldType', definition.field_type,
            'options', definition.options
        )
    ), '{}'::jsonb)
    into v_definitions
    from commerce.custom_field_definitions definition
    where definition.entity_type = p_entity_type
      and (definition.enabled or p_actor_kind = 'system')
      and p_values ? definition.key;

    for v_key, v_value in select key, value from jsonb_each(p_values)
    loop
        v_definition := v_definitions->v_key;

        if v_definition is null then
            raise exception 'validation: unknown custom field % for %', v_key, p_entity_type;
        end if;
        if p_actor_kind = 'self' and not (v_definition->>'selfEditable')::boolean then
            raise exception 'forbidden: custom field % is not self editable', v_key;
        end if;
        if p_actor_kind = 'admin' and not (v_definition->>'adminEditable')::boolean then
            raise exception 'forbidden: custom field % is not admin editable', v_key;
        end if;
        if v_definition->>'fieldType' in ('string', 'enum') and jsonb_typeof(v_value) <> 'string' then
            raise exception 'validation: custom field % must be a string', v_key;
        elsif v_definition->>'fieldType' = 'number' and jsonb_typeof(v_value) <> 'number' then
            raise exception 'validation: custom field % must be a number', v_key;
        elsif v_definition->>'fieldType' = 'boolean' and jsonb_typeof(v_value) <> 'boolean' then
            raise exception 'validation: custom field % must be a boolean', v_key;
        end if;
        if v_definition->>'fieldType' = 'enum'
            and not (v_definition->'options' @> jsonb_build_array(v_value)) then
            raise exception 'validation: custom field % has an unsupported value', v_key;
        end if;
    end loop;

end;
$$;