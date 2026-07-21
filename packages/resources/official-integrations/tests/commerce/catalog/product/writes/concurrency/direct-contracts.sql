create temporary table matrix_direct_results (result jsonb not null);
insert into matrix_direct_results
select result from public.dblink_get_result('matrix_direct_a') response(result jsonb);
insert into matrix_direct_results
select result from public.dblink_get_result('matrix_direct_b') response(result jsonb);

do $direct_contract$
declare
    v_product_id bigint;
    v_axes text[];
    v_variants text[];
begin
    select product_id into v_product_id
    from commerce_product_matrix_test.products where label = 'direct-race';
    select array_agg(key order by key) into v_axes
    from commerce.product_variant_axes where product_id = v_product_id;
    select array_agg(combination_key order by combination_key) into v_variants
    from commerce.product_variants
    where product_id = v_product_id and generated_from_axes;

    if (select count(*) from matrix_direct_results where result->>'ok' = 'true') <> 2
       or v_axes not in (
            array['size'], array['color'], array['color', 'size']
       ) or v_variants not in (
            array['size:s'], array['color:red'], array['color:red', 'size:s']
       ) or (select count(*) from commerce.product_variant_selections
             where product_id = v_product_id) <> cardinality(v_variants)
       or exists (
            select 1
            from commerce.product_variants variant
            left join commerce.product_variant_selections selection
              on selection.product_id = variant.product_id
             and selection.variant_id = variant.id
            left join commerce.product_variant_axes axis
              on axis.id = selection.axis_id
            where variant.product_id = v_product_id
              and variant.generated_from_axes
              and split_part(variant.combination_key, ':', 1) <> axis.key
       ) then
        raise exception 'matrix direct race: incoherent result %, %, %',
            v_axes, v_variants, (select jsonb_agg(result) from matrix_direct_results);
    end if;
end;
$direct_contract$;

select public.dblink_disconnect('matrix_direct_a');
select public.dblink_disconnect('matrix_direct_b');

begin;
select commerce_product_matrix_test.cleanup();
commit;
drop schema commerce_product_matrix_test cascade;
