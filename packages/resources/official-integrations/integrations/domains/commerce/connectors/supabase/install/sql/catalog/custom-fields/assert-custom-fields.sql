

create or replace function commerce.assert_custom_fields(
    p_entity_type text,
    p_values jsonb,
    p_actor_kind text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    p_values := coalesce(p_values, '{}'::jsonb);
    perform commerce.assert_custom_field_patch(p_entity_type, p_values, p_actor_kind);
    if exists (
        select 1
        from commerce.custom_field_definitions definition
        where definition.entity_type = p_entity_type
          and definition.enabled
          and definition.required
          and not (p_values ? definition.key)
    ) then
        raise exception 'validation: required custom fields are missing for %', p_entity_type;
    end if;
end;
$$;

create or replace function commerce.assert_product_custom_fields(
    p_category_id bigint,
    p_values jsonb,
    p_actor_kind text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    if p_category_id is null then
        perform commerce.assert_custom_fields('product', p_values, p_actor_kind);
        return;
    end if;
    if not exists (select 1 from commerce.categories where id = p_category_id) then
        raise exception 'validation: primary category does not exist';
    end if;
    perform commerce.assert_custom_field_patch('product', p_values, p_actor_kind);

    if exists (
        with recursive ancestry as (
            select id, parent_id from commerce.categories where id = p_category_id
            union all
            select parent.id, parent.parent_id
            from commerce.categories parent join ancestry child on child.parent_id = parent.id
        )
        select 1 from jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) key
        where not exists (
            select 1 from ancestry
            join commerce.category_custom_fields field on field.category_id = ancestry.id
            join commerce.custom_field_definitions definition
              on definition.entity_type = field.entity_type and definition.key = field.field_key
            where definition.enabled and field.field_key = key
        )
    ) then raise exception 'validation: product metadata contains a field outside its category schema'; end if;

    if exists (
        with recursive ancestry as (
            select id, parent_id from commerce.categories where id = p_category_id
            union all
            select parent.id, parent.parent_id
            from commerce.categories parent join ancestry child on child.parent_id = parent.id
        )
        select 1 from ancestry
        join commerce.category_custom_fields field on field.category_id = ancestry.id
        join commerce.custom_field_definitions definition
          on definition.entity_type = field.entity_type and definition.key = field.field_key
        where definition.enabled and field.required and not (coalesce(p_values, '{}'::jsonb) ? field.field_key)
    ) then raise exception 'validation: required category fields are missing for product'; end if;
end;
$$;

create or replace function commerce.assert_product_custom_fields_with_axes(
    p_category_id bigint,
    p_values jsonb,
    p_actor_kind text,
    p_axis_field_keys jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    if p_category_id is null then
        perform commerce.assert_custom_fields('product', p_values, p_actor_kind);
        return;
    end if;
    if not exists (select 1 from commerce.categories where id = p_category_id) then
        raise exception 'validation: primary category does not exist';
    end if;
    if jsonb_typeof(coalesce(p_axis_field_keys, '[]'::jsonb)) <> 'array' then
        raise exception 'validation: variant axis field keys must be an array';
    end if;
    perform commerce.assert_custom_field_patch('product', p_values, p_actor_kind);

    if exists (
        with recursive ancestry as (
            select id, parent_id from commerce.categories where id = p_category_id
            union all
            select parent.id, parent.parent_id
            from commerce.categories parent join ancestry child on child.parent_id = parent.id
        )
        select 1 from jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) key
        where not exists (
            select 1 from ancestry
            join commerce.category_custom_fields field on field.category_id = ancestry.id
            join commerce.custom_field_definitions definition
              on definition.entity_type = field.entity_type and definition.key = field.field_key
            where definition.enabled and field.field_key = key
        )
    ) then raise exception 'validation: product metadata contains a field outside its category schema'; end if;

    if exists (
        with recursive ancestry as (
            select id, parent_id from commerce.categories where id = p_category_id
            union all
            select parent.id, parent.parent_id
            from commerce.categories parent join ancestry child on child.parent_id = parent.id
        )
        select 1 from ancestry
        join commerce.category_custom_fields field on field.category_id = ancestry.id
        join commerce.custom_field_definitions definition
          on definition.entity_type = field.entity_type and definition.key = field.field_key
        where definition.enabled and field.required
          and not (coalesce(p_values, '{}'::jsonb) ? field.field_key)
          and not (coalesce(p_axis_field_keys, '[]'::jsonb) ? field.field_key)
    ) then raise exception 'validation: required category fields are missing for product or variants'; end if;
end;
$$;