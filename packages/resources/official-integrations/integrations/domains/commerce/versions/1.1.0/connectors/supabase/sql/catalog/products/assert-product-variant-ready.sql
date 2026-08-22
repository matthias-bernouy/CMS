

create or replace function commerce.assert_product_variant_ready(
    p_product_id bigint,
    p_variant_id bigint
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_axis_count integer;
begin
    select count(*) into v_axis_count
    from commerce.product_variant_axes
    where product_id = p_product_id;

    if v_axis_count > 0 and p_variant_id is null then
        raise exception 'validation: a product variant is required when the product has variant axes';
    end if;
    if p_variant_id is null then return; end if;
    if not exists (
        select 1
        from commerce.product_variants variant
        where variant.id = p_variant_id
          and variant.product_id = p_product_id
          and variant.status = 'active'
          and (v_axis_count = 0 or variant.combination_key is not null)
    ) then
        raise exception 'validation: an active product variant is required';
    end if;
    if v_axis_count > 0 and (
        select count(distinct selection.axis_id)
        from commerce.product_variant_selections selection
        where selection.product_id = p_product_id
          and selection.variant_id = p_variant_id
    ) <> v_axis_count then
        raise exception 'validation: the product variant does not select every variant axis';
    end if;
end;
$$;