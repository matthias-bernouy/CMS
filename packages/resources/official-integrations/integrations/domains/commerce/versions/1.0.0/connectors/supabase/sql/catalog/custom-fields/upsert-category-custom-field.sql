

create or replace function commerce.upsert_category_custom_field(
    p_category_id bigint,
    p_field_key text,
    p_required boolean default false,
    p_filterable boolean default false,
    p_position integer default 0,
    p_unit text default null,
    p_operators jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_definition commerce.custom_field_definitions%rowtype;
    v_field commerce.category_custom_fields%rowtype;
begin
    select * into v_definition from commerce.custom_field_definitions
    where entity_type = 'product' and key = p_field_key and enabled;
    if not found then raise exception 'validation: enabled Product custom field does not exist'; end if;
    if not exists (select 1 from commerce.categories where id = p_category_id) then
        raise exception 'validation: category does not exist';
    end if;
    if jsonb_typeof(coalesce(p_operators, '[]'::jsonb)) <> 'array' then
        raise exception 'validation: filter operators must be an array';
    end if;
    if exists (
        select 1 from jsonb_array_elements_text(coalesce(p_operators, '[]'::jsonb)) operator
        where operator not in ('eq', 'in', 'gte', 'lte')
           or (v_definition.field_type <> 'number' and operator in ('gte', 'lte'))
           or (v_definition.field_type not in ('enum', 'string') and operator = 'in')
    ) then raise exception 'validation: unsupported filter operator for custom field'; end if;

    insert into commerce.category_custom_fields (
        category_id, entity_type, field_key, required, filterable, position, unit, operators
    ) values (
        p_category_id, 'product', p_field_key, coalesce(p_required, false), coalesce(p_filterable, false),
        coalesce(p_position, 0), null, '[]'::jsonb
    ) on conflict (category_id, field_key) do update
    set required = excluded.required,
        filterable = excluded.filterable,
        position = excluded.position,
        unit = null,
        operators = '[]'::jsonb
    returning * into v_field;
    return to_jsonb(v_field);
end;
$$;