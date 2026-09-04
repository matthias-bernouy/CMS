

create or replace function commerce.effective_variant_metadata(
    p_product_id bigint,
    p_variant_id bigint default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(product.metadata, '{}'::jsonb)
        || coalesce(variant.metadata, '{}'::jsonb)
        || coalesce((
            select jsonb_object_agg(axis.field_key, axis_value.value)
            from commerce.product_variant_selections selection
            join commerce.product_variant_axes axis
              on axis.product_id = selection.product_id and axis.id = selection.axis_id
            join commerce.product_variant_axis_values axis_value
              on axis_value.product_id = selection.product_id
             and axis_value.axis_id = selection.axis_id and axis_value.id = selection.value_id
            where selection.product_id = p_product_id
              and selection.variant_id = p_variant_id
              and axis.field_key is not null
        ), '{}'::jsonb)
    from commerce.products product
    left join commerce.product_variants variant
      on variant.product_id = product.id and variant.id = p_variant_id
    where product.id = p_product_id;
$$;