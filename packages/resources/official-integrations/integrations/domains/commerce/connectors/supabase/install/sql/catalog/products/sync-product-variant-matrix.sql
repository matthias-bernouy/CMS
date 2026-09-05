

create or replace function commerce.sync_product_variant_matrix(
    p_product_id bigint,
    p_axes jsonb,
    p_matrix jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_axis jsonb;
    v_value jsonb;
    v_row jsonb;
    v_choice jsonb;
    v_axis_id bigint;
    v_category_id bigint;
    v_definition commerce.custom_field_definitions%rowtype;
    v_typed_value jsonb;
    v_variant commerce.product_variants%rowtype;
    v_can_batch boolean;
    v_expected integer := 1;
    v_axis_count integer;
begin
    p_axes := coalesce(p_axes, '[]'::jsonb);
    p_matrix := coalesce(p_matrix, '[]'::jsonb);
    if jsonb_typeof(p_axes) <> 'array' or jsonb_array_length(p_axes) > 4 then
        raise exception 'validation: variant axes must be an array with at most four axes';
    end if;
    if jsonb_typeof(p_matrix) <> 'array' then
        raise exception 'validation: variant matrix must be an array';
    end if;
    v_axis_count := jsonb_array_length(p_axes);
    if exists (
        select 1 from jsonb_array_elements(p_axes) axis
        where jsonb_typeof(axis) <> 'object'
           or coalesce(axis->>'key', '') !~ '^[a-z][a-z0-9_-]{0,47}$'
           or (axis ? 'fieldKey' and coalesce(axis->>'fieldKey', '') !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$')
           or length(btrim(coalesce(axis->>'label', ''))) = 0
           or jsonb_typeof(axis->'values') <> 'array'
           or jsonb_array_length(axis->'values') not between 1 and 20
    ) then raise exception 'validation: every variant axis needs a key, label, and one to twenty values'; end if;
    if (select count(*) from jsonb_array_elements(p_axes)) <> (
        select count(distinct axis->>'key') from jsonb_array_elements(p_axes) axis
    ) then raise exception 'validation: variant axis keys must be unique'; end if;

    for v_axis in select value from jsonb_array_elements(p_axes)
    loop
        v_expected := v_expected * jsonb_array_length(v_axis->'values');
        if v_expected > 100 then raise exception 'validation: variant matrix cannot exceed 100 combinations'; end if;
        if (select count(*) from jsonb_array_elements(v_axis->'values')) <> (
            select count(distinct item->>'key') from jsonb_array_elements(v_axis->'values') item
        ) then raise exception 'validation: variant value keys must be unique inside an axis'; end if;
    end loop;
    if v_axis_count = 0 then v_expected := 0; end if;
    if jsonb_array_length(p_matrix) <> v_expected then
        raise exception 'validation: variant matrix does not match the cartesian product';
    end if;
    if (select count(*) from jsonb_array_elements(p_matrix)) <> (
        select count(distinct row->>'key') from jsonb_array_elements(p_matrix) row
    ) then raise exception 'validation: variant combination keys must be unique'; end if;

    -- The normal Product write already owns this lock; direct replacements need it too.
    perform id from commerce.products where id = p_product_id for update;
    delete from commerce.product_variant_selections where product_id = p_product_id;
    delete from commerce.product_variant_axes where product_id = p_product_id;
    select category_id into v_category_id from commerce.product_categories
    where product_id = p_product_id and is_primary;
    for v_axis in select value from jsonb_array_elements(p_axes) order by (value->>'position')::integer
    loop
        v_definition := null;
        if nullif(v_axis->>'fieldKey', '') is not null then
            with recursive ancestry as (
                select id, parent_id from commerce.categories where id = v_category_id
                union all
                select parent.id, parent.parent_id
                from commerce.categories parent join ancestry child on child.parent_id = parent.id
            )
            select definition.* into v_definition
            from ancestry
            join commerce.category_custom_fields field on field.category_id = ancestry.id
            join commerce.custom_field_definitions definition
              on definition.entity_type = field.entity_type and definition.key = field.field_key
            where definition.enabled and definition.entity_type = 'product'
              and definition.key = v_axis->>'fieldKey'
            limit 1;
            if not found then raise exception 'validation: variant axis metadata is not applicable to the primary category'; end if;
            if exists (select 1 from commerce.products where id = p_product_id and metadata ? (v_axis->>'fieldKey')) then
                raise exception 'validation: variant axis metadata cannot also be stored on the Product';
            end if;
        end if;
        insert into commerce.product_variant_axes (product_id, key, field_key, label, position)
        values (
            p_product_id, v_axis->>'key', nullif(v_axis->>'fieldKey', ''),
            coalesce(v_definition.label, btrim(v_axis->>'label')),
            coalesce(nullif(v_axis->>'position', '')::integer, 0)
        ) returning id into v_axis_id;
        for v_value in select value from jsonb_array_elements(v_axis->'values') order by (value->>'position')::integer
        loop
            v_typed_value := case v_definition.field_type
                when 'number' then to_jsonb((v_value->>'value')::numeric)
                when 'boolean' then to_jsonb((v_value->>'value')::boolean)
                else to_jsonb(v_value->>'value')
            end;
            if v_definition.field_type = 'enum' and not (v_definition.options @> jsonb_build_array(v_value->>'value')) then
                raise exception 'validation: variant axis value is not allowed by its metadata definition';
            end if;
            insert into commerce.product_variant_axis_values (product_id, axis_id, key, label, value, position)
            values (
                p_product_id, v_axis_id, v_value->>'key', btrim(v_value->>'label'),
                coalesce(v_typed_value, to_jsonb(v_value->>'label')),
                coalesce(nullif(v_value->>'position', '')::integer, 0)
            );
        end loop;
    end loop;

    if exists (
        select 1 from commerce.product_variants variant
        join commerce.product_variant_axes axis on axis.product_id = variant.product_id
        where variant.product_id = p_product_id
          and axis.field_key is not null
          and variant.metadata ? axis.field_key
    ) then raise exception 'validation: variant axis metadata cannot also be overridden on a Variant'; end if;

    -- Batch only inputs whose row-local checks cannot alter error precedence.
    select not exists (
        select 1
        from jsonb_array_elements(p_matrix) row
        where case when jsonb_typeof(row->'choices') = 'array' then
            jsonb_array_length(row->'choices') <> v_axis_count
            or (
                select count(distinct choice->>'axisKey')
                from jsonb_array_elements(row->'choices') choice
            ) <> v_axis_count
            or exists (
                select 1
                from jsonb_array_elements(row->'choices') choice
                where not exists (
                    select 1
                    from commerce.product_variant_axes axis
                    join commerce.product_variant_axis_values axis_value
                      on axis_value.product_id = axis.product_id
                     and axis_value.axis_id = axis.id
                    where axis.product_id = p_product_id
                      and axis.key = choice->>'axisKey'
                      and axis_value.key = choice->>'valueKey'
                )
            )
        else true end
    ) into v_can_batch;

    if v_can_batch then
        insert into commerce.product_variants (
            product_id, sku, title, status, position,
            combination_key, generated_from_axes
        )
        select p_product_id, null, btrim(row.value->>'title'),
               coalesce(nullif(row.value->>'status', ''), 'active'),
               coalesce(nullif(row.value->>'position', '')::integer, 0),
               row.value->>'key', true
        from jsonb_array_elements(p_matrix) with ordinality row(value, ordinality)
        order by (row.value->>'position')::integer nulls last, row.ordinality
        on conflict (product_id, combination_key)
            where combination_key is not null do update
        set title = excluded.title,
            status = excluded.status,
            position = excluded.position,
            generated_from_axes = true;

        insert into commerce.product_variant_selections (
            product_id, variant_id, axis_id, value_id
        )
        select p_product_id, variant.id, axis.id, axis_value.id
        from jsonb_array_elements(p_matrix) with ordinality row(value, ordinality)
        cross join lateral jsonb_array_elements(row.value->'choices')
            with ordinality choice(value, ordinality)
        join commerce.product_variants variant
          on variant.product_id = p_product_id
         and variant.combination_key = row.value->>'key'
        join commerce.product_variant_axes axis
          on axis.product_id = p_product_id
         and axis.key = choice.value->>'axisKey'
        join commerce.product_variant_axis_values axis_value
          on axis_value.product_id = axis.product_id
         and axis_value.axis_id = axis.id
         and axis_value.key = choice.value->>'valueKey'
        order by (row.value->>'position')::integer nulls last,
                 row.ordinality,
                 choice.ordinality;
    else
        -- Invalid inputs retain the historical row-by-row diagnostic and sequence effects.
        for v_row in select value from jsonb_array_elements(p_matrix)
            order by (value->>'position')::integer
        loop
            if jsonb_typeof(v_row->'choices') <> 'array'
                or jsonb_array_length(v_row->'choices') <> v_axis_count then
                raise exception 'validation: every variant combination must select one value per axis';
            end if;
            if (
                select count(distinct choice->>'axisKey')
                from jsonb_array_elements(v_row->'choices') choice
            ) <> v_axis_count then
                raise exception 'validation: every variant combination must select each axis exactly once';
            end if;
            insert into commerce.product_variants (
                product_id, sku, title, status, position,
                combination_key, generated_from_axes
            ) values (
                p_product_id, null, btrim(v_row->>'title'),
                coalesce(nullif(v_row->>'status', ''), 'active'),
                coalesce(nullif(v_row->>'position', '')::integer, 0),
                v_row->>'key', true
            ) on conflict (product_id, combination_key)
                where combination_key is not null do update
            set title = excluded.title,
                status = excluded.status,
                position = excluded.position,
                generated_from_axes = true
            returning * into v_variant;

            for v_choice in select value from jsonb_array_elements(v_row->'choices')
            loop
                insert into commerce.product_variant_selections (
                    product_id, variant_id, axis_id, value_id
                )
                select p_product_id, v_variant.id, axis.id, axis_value.id
                from commerce.product_variant_axes axis
                join commerce.product_variant_axis_values axis_value
                  on axis_value.product_id = axis.product_id
                 and axis_value.axis_id = axis.id
                where axis.product_id = p_product_id
                  and axis.key = v_choice->>'axisKey'
                  and axis_value.key = v_choice->>'valueKey';
                if not found then
                    raise exception 'validation: variant choice is not part of the product axes';
                end if;
            end loop;
        end loop;
    end if;

    update commerce.product_variants variant
    set status = 'archived'
    where variant.product_id = p_product_id
      and variant.generated_from_axes
      and not exists (
          select 1 from jsonb_array_elements(p_matrix) row
          where row->>'key' = variant.combination_key
      );
    update commerce.offers offer
    set publication_status = 'paused'
    where offer.product_id = p_product_id
      and offer.publication_status = 'active'
      and not exists (
          select 1
          from commerce.product_variants variant
          where variant.id = offer.variant_id
            and variant.product_id = offer.product_id
            and variant.status = 'active'
            and (
                v_axis_count = 0
                or (
                    variant.combination_key is not null
                    and (
                        select count(distinct selection.axis_id)
                        from commerce.product_variant_selections selection
                        where selection.product_id = offer.product_id
                          and selection.variant_id = variant.id
                    ) = v_axis_count
                )
            )
      )
      and (v_axis_count > 0 or offer.variant_id is not null);
end;
$$;