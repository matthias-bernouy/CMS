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
    v_generated_count integer;
    v_archived_count integer;
begin
    select product_id into v_product_id
    from commerce_product_matrix_test.products where label = 'direct-race';
    select array_agg(key order by key) into v_axes
    from commerce.product_variant_axes where product_id = v_product_id;
    select array_agg(combination_key order by combination_key) into v_variants
    from commerce.product_variants
    where product_id = v_product_id
      and generated_from_axes
      and status = 'active';
    select count(*), count(*) filter (where status = 'archived')
    into v_generated_count, v_archived_count
    from commerce.product_variants
    where product_id = v_product_id and generated_from_axes;

    if (select count(*) from matrix_direct_results where result->>'ok' = 'true') <> 2
       or not (
            (v_axes = array['size'] and v_variants = array['size:s'])
            or (v_axes = array['color'] and v_variants = array['color:red'])
       )
       or v_generated_count <> 2
       or v_archived_count <> 1
       or (select count(*) from commerce.product_variants
           where product_id = v_product_id and generated_from_axes
             and status = 'active' and version = 1) <> 1
       or (select count(*) from commerce.product_variants
           where product_id = v_product_id and generated_from_axes
             and status = 'archived' and version = 2) <> 1
       or (select count(*) from commerce.product_variant_selections
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
              and variant.status = 'active'
              and split_part(variant.combination_key, ':', 1) is distinct from axis.key
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
