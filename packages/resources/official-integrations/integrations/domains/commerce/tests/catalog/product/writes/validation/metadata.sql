do $metadata_fixture$
declare
    v_category jsonb;
    v_bundle jsonb;
begin
    perform commerce.upsert_custom_field(
        'product', 'matrixWeight', 'Weight', 'number', '[]'::jsonb,
        false, false, true, true, false, 0, true, 'g'
    );
    perform commerce.upsert_custom_field(
        'product', 'matrixRefurbished', 'Refurbished', 'boolean', '[]'::jsonb,
        false, false, true, true, false, 1, true, null
    );
    perform commerce.upsert_custom_field(
        'product', 'matrixFinish', 'Finish', 'enum', '["matte","glossy"]'::jsonb,
        false, false, true, true, false, 2, true, null
    );
    perform commerce.upsert_custom_field(
        'product', 'matrixMaterial', 'Material', 'string', '[]'::jsonb,
        false, false, true, true, false, 3, true, null
    );
    perform commerce.upsert_custom_field(
        'product', 'matrixDetached', 'Detached', 'string', '[]'::jsonb,
        false, false, true, true, false, 4, true, null
    );
    v_category := commerce.upsert_category(
        null, '{"slug":"matrix-typed","label":"Matrix typed"}'::jsonb, null
    );
    perform commerce.upsert_category_custom_field(
        (v_category->>'id')::bigint, field_key
    ) from unnest(array[
        'matrixWeight', 'matrixRefurbished', 'matrixFinish', 'matrixMaterial'
    ]) field_key;
    v_bundle := commerce.upsert_product_read_model(null, jsonb_build_object(
        'slug', 'matrix-contract-metadata',
        'title', 'Matrix metadata contract',
        'primaryCategoryId', v_category->>'id',
        'variantAxes', '[
            {"key":"material","fieldKey":"matrixMaterial","label":"Ignored","position":3,
             "values":[{"key":"graphite","label":"Graphite","value":"Graphite","position":0}]},
            {"key":"finish","fieldKey":"matrixFinish","label":"Ignored","position":2,
             "values":[{"key":"matte","label":"Matte","value":"matte","position":0}]},
            {"key":"refurbished","fieldKey":"matrixRefurbished","label":"Ignored","position":1,
             "values":[{"key":"yes","label":"Yes","value":"true","position":0}]},
            {"key":"weight","fieldKey":"matrixWeight","label":"Ignored","position":0,
             "values":[{"key":"300g","label":"300 g","value":"300.50","position":0}]}
        ]'::jsonb,
        'variantMatrix', '[{
            "key":"typed","title":"Typed","position":0,"choices":[
                {"axisKey":"material","valueKey":"graphite"},
                {"axisKey":"finish","valueKey":"matte"},
                {"axisKey":"refurbished","valueKey":"yes"},
                {"axisKey":"weight","valueKey":"300g"}
            ]
        }]'::jsonb
    ), null);
    insert into commerce_product_matrix_test.products
    values (
        'metadata',
        (v_bundle->'product'->>'id')::bigint,
        (v_bundle->'product'->>'version')::integer
    );
end;
$metadata_fixture$;

do $typed_values$
declare
    v_product_id bigint;
    v_bundle jsonb;
    v_axes jsonb;
    v_values jsonb;
begin
    select product_id into v_product_id
    from commerce_product_matrix_test.products where label = 'metadata';
    v_bundle := commerce.product_read_bundle(v_product_id, null, false, false);
    select jsonb_object_agg(item->>'field_key', item->>'label') into v_axes
    from jsonb_array_elements(v_bundle->'axes') item;
    select jsonb_object_agg(axis.field_key, axis_value.value) into v_values
    from commerce.product_variant_axis_values axis_value
    join commerce.product_variant_axes axis on axis.id = axis_value.axis_id
    where axis.product_id = v_product_id;
    if v_axes <> '{
            "matrixWeight":"Weight",
            "matrixRefurbished":"Refurbished",
            "matrixFinish":"Finish",
            "matrixMaterial":"Material"
        }'::jsonb
       or v_values <> '{
            "matrixWeight":300.5,
            "matrixRefurbished":true,
            "matrixFinish":"matte",
            "matrixMaterial":"Graphite"
        }'::jsonb
       or jsonb_typeof(v_values->'matrixWeight') <> 'number'
       or jsonb_typeof(v_values->'matrixRefurbished') <> 'boolean'
       or jsonb_typeof(v_values->'matrixFinish') <> 'string'
       or jsonb_typeof(v_values->'matrixMaterial') <> 'string' then
        raise exception 'matrix metadata contract: typed values changed: %, %', v_axes, v_values;
    end if;
end;
$typed_values$;

select commerce_product_matrix_test.assert_sync_error(
    'metadata', '[{
        "key":"finish","fieldKey":"matrixFinish","label":"Finish",
        "values":[{"key":"satin","label":"Satin","value":"satin"}]
    }]'::jsonb, '[{
        "key":"finish:satin","title":"Satin",
        "choices":[{"axisKey":"finish","valueKey":"satin"}]
    }]'::jsonb,
    'validation: variant axis value is not allowed by its metadata definition'
);

select commerce_product_matrix_test.assert_sync_error(
    'metadata', '[{
        "key":"detached","fieldKey":"matrixDetached","label":"Detached",
        "values":[{"key":"one","label":"One","value":"one"}]
    }]'::jsonb, '[{
        "key":"detached:one","title":"One",
        "choices":[{"axisKey":"detached","valueKey":"one"}]
    }]'::jsonb,
    'validation: variant axis metadata is not applicable to the primary category'
);

do $metadata_overlap$
declare
    v_product_id bigint;
    v_version integer;
begin
    select product_id into v_product_id
    from commerce_product_matrix_test.products where label = 'metadata';
    select version into v_version from commerce.products where id = v_product_id;
    begin
        perform commerce.upsert_product_read_model(v_product_id, jsonb_build_object(
            'metadata', '{"matrixWeight":300.5}'::jsonb,
            'variantAxes', '[{"key":"weight","fieldKey":"matrixWeight","label":"Weight",
                "values":[{"key":"300g","label":"300 g","value":"300.5"}]}]'::jsonb,
            'variantMatrix', '[{"key":"weight:300g","title":"300 g",
                "choices":[{"axisKey":"weight","valueKey":"300g"}]}]'::jsonb
        ), v_version);
        raise exception 'matrix metadata contract: Product overlap was accepted';
    exception when others then
        if sqlerrm <> 'validation: variant axis metadata cannot also be stored on the Product' then
            raise;
        end if;
    end;
    if (select version from commerce.products where id = v_product_id) <> v_version
       or (select metadata from commerce.products where id = v_product_id) <> '{}'::jsonb
       or (select count(*) from commerce.product_variant_axes where product_id = v_product_id) <> 4 then
        raise exception 'matrix metadata contract: failed Product overlap was not atomic';
    end if;

    update commerce.product_variants set metadata = '{"matrixWeight":300.5}'::jsonb
    where product_id = v_product_id and combination_key = 'typed';
    perform commerce_product_matrix_test.assert_sync_error(
        'metadata', '[{"key":"weight","fieldKey":"matrixWeight","label":"Weight",
            "values":[{"key":"300g","label":"300 g","value":"300.5"}]}]'::jsonb,
        '[{"key":"weight:300g","title":"300 g",
            "choices":[{"axisKey":"weight","valueKey":"300g"}]}]'::jsonb,
        'validation: variant axis metadata cannot also be overridden on a Variant'
    );
end;
$metadata_overlap$;
