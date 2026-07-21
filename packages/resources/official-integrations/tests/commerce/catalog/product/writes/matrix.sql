select commerce_product_matrix_test.seed_product('complete');

do $matrix_contract$
declare
    v_product_id bigint;
    v_bundle jsonb;
    v_axes jsonb;
    v_values jsonb;
    v_variants jsonb;
    v_selections jsonb;
begin
    select product_id into v_product_id
    from commerce_product_matrix_test.products where label = 'complete';
    v_bundle := commerce.product_read_bundle(v_product_id, null, false, false);

    select jsonb_agg(jsonb_build_object(
        'key', item.value->>'key',
        'fieldKey', item.value->'field_key',
        'label', item.value->>'label',
        'position', (item.value->>'position')::integer
    ) order by item.ordinality) into v_axes
    from jsonb_array_elements(v_bundle->'axes') with ordinality item(value, ordinality);

    select jsonb_agg(jsonb_build_object(
        'axisKey', axis.key,
        'key', item.value->>'key',
        'label', item.value->>'label',
        'value', item.value->'value',
        'position', (item.value->>'position')::integer
    ) order by item.ordinality) into v_values
    from jsonb_array_elements(v_bundle->'values') with ordinality item(value, ordinality)
    join commerce.product_variant_axes axis
      on axis.id = (item.value->>'axis_id')::bigint;

    select jsonb_agg(jsonb_build_object(
        'key', item.value->>'combination_key',
        'title', item.value->>'title',
        'status', item.value->>'status',
        'position', (item.value->>'position')::integer,
        'generated', (item.value->>'generated_from_axes')::boolean,
        'version', (item.value->>'version')::integer
    ) order by item.ordinality) into v_variants
    from jsonb_array_elements(v_bundle->'variants') with ordinality item(value, ordinality);

    select jsonb_agg(jsonb_build_object(
        'variant', variant.combination_key,
        'axis', axis.key,
        'value', axis_value.key
    ) order by item.ordinality) into v_selections
    from jsonb_array_elements(v_bundle->'selections') with ordinality item(value, ordinality)
    join commerce.product_variants variant
      on variant.id = (item.value->>'variant_id')::bigint
    join commerce.product_variant_axes axis
      on axis.id = (item.value->>'axis_id')::bigint
    join commerce.product_variant_axis_values axis_value
      on axis_value.id = (item.value->>'value_id')::bigint;

    if v_bundle is null
       or v_axes <> '[
            {"key":"color","fieldKey":null,"label":"Color","position":0},
            {"key":"size","fieldKey":null,"label":"Size","position":1}
       ]'::jsonb
       or v_values <> '[
            {"axisKey":"color","key":"red","label":"Red","value":"red","position":0},
            {"axisKey":"size","key":"s","label":"Small","value":"S","position":0},
            {"axisKey":"color","key":"blue","label":"Blue","value":"blue","position":1},
            {"axisKey":"size","key":"l","label":"Large","value":"L","position":1}
       ]'::jsonb
       or v_variants <> '[
            {"key":"red-s","title":"Red / Small","status":"active","position":0,"generated":true,"version":1},
            {"key":"blue-s","title":"Blue / Small","status":"active","position":1,"generated":true,"version":1},
            {"key":"red-l","title":"Red / Large","status":"active","position":2,"generated":true,"version":1},
            {"key":"blue-l","title":"Blue / Large","status":"active","position":3,"generated":true,"version":1}
       ]'::jsonb
       or v_selections <> '[
            {"variant":"red-s","axis":"size","value":"s"},
            {"variant":"red-s","axis":"color","value":"red"},
            {"variant":"blue-s","axis":"size","value":"s"},
            {"variant":"blue-s","axis":"color","value":"blue"},
            {"variant":"red-l","axis":"size","value":"l"},
            {"variant":"red-l","axis":"color","value":"red"},
            {"variant":"blue-l","axis":"size","value":"l"},
            {"variant":"blue-l","axis":"color","value":"blue"}
       ]'::jsonb then
        raise exception 'matrix contract: incomplete or reordered bundle: %, %, %, %',
            v_axes, v_values, v_variants, v_selections;
    end if;

    if jsonb_array_length(v_bundle->'axes') <> 2
       or jsonb_array_length(v_bundle->'values') <> 4
       or jsonb_array_length(v_bundle->'variants') <> 4
       or jsonb_array_length(v_bundle->'selections') <> 8
       or exists (
            select 1 from commerce.product_variant_selections selection
            left join commerce.product_variant_axis_values axis_value
              on axis_value.id = selection.value_id
             and axis_value.axis_id = selection.axis_id
             and axis_value.product_id = selection.product_id
            where selection.product_id = v_product_id and axis_value.id is null
       ) then
        raise exception 'matrix contract: persisted matrix is incomplete';
    end if;
end;
$matrix_contract$;
