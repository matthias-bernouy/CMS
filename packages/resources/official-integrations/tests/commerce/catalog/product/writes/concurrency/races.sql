create temporary table matrix_race_results (result jsonb not null);
insert into matrix_race_results
select result from public.dblink_get_result('matrix_race_a') response(result jsonb);
insert into matrix_race_results
select result from public.dblink_get_result('matrix_race_b') response(result jsonb);

do $race_contract$
declare
    v_product commerce.products%rowtype;
    v_initial_version integer;
    v_winner_title text;
begin
    select product.* into v_product
    from commerce.products product
    join commerce_product_matrix_test.products seeded on seeded.product_id = product.id
    where seeded.label = 'race';
    select initial_version into v_initial_version
    from commerce_product_matrix_test.products where label = 'race';
    select result->'product'->>'title' into v_winner_title
    from matrix_race_results where (result->>'ok')::boolean;

    if (select count(*) from matrix_race_results where (result->>'ok')::boolean) <> 1
       or (select count(*) from matrix_race_results
           where not (result->>'ok')::boolean
             and result->>'message' = 'conflict: stale product version') <> 1
       or v_product.version <> v_initial_version + 1
       or v_product.title <> v_winner_title
       or v_product.title not in ('Race winner A', 'Race winner B')
       or exists (
            select 1 from matrix_race_variants old
            full join commerce.product_variants current
              on current.id = old.id and current.combination_key = old.combination_key
            where coalesce(current.product_id, old.product_id) = v_product.id
              and (old.id is null or current.id is null
                or current.version <> old.version + 1)
       ) then
        raise exception 'matrix race: optimistic writer contract changed: %, %',
            to_jsonb(v_product), (select jsonb_agg(result) from matrix_race_results);
    end if;
end;
$race_contract$;

select public.dblink_disconnect('matrix_race_a');
select public.dblink_disconnect('matrix_race_b');

begin;
select commerce_product_matrix_test.cleanup();
commit;
drop schema commerce_product_matrix_test cascade;
