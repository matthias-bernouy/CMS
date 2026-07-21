create extension if not exists dblink;

create function commerce_product_matrix_test.try_update(
    p_label text,
    p_title text,
    p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_product_id bigint;
    v_bundle jsonb;
begin
    select product_id into strict v_product_id
    from commerce_product_matrix_test.products where label = p_label;
    v_bundle := commerce.upsert_product_read_model(v_product_id, jsonb_build_object(
        'title', p_title,
        'variantAxes', commerce_product_matrix_test.basic_axes(),
        'variantMatrix', commerce_product_matrix_test.basic_matrix()
    ), p_expected_version);
    return jsonb_build_object('ok', true, 'product', v_bundle->'product');
exception when others then
    return jsonb_build_object(
        'ok', false,
        'sqlstate', sqlstate,
        'message', sqlerrm
    );
end;
$$;

create function commerce_product_matrix_test.wait_until_blocked(p_application_name text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
    loop
        if exists (
            select 1 from pg_catalog.pg_stat_activity activity
            where activity.application_name = p_application_name
              and activity.wait_event_type = 'Lock'
        ) then
            return;
        end if;
        if clock_timestamp() >= v_deadline then
            raise exception 'matrix race: session % did not block', p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

grant execute on function commerce_product_matrix_test.wait_until_blocked(text)
to service_role;

create temporary table matrix_race_variants as
select variant.id, variant.product_id, variant.combination_key, variant.version
from commerce.product_variants variant
join commerce_product_matrix_test.products seeded on seeded.product_id = variant.product_id
where seeded.label = 'race' and variant.generated_from_axes;

begin;
select product.id
from commerce.products product
join commerce_product_matrix_test.products seeded on seeded.product_id = product.id
where seeded.label = 'race'
for update;

select public.dblink_connect(
    'matrix_race_a', 'dbname=' || current_database()
        || ' application_name=matrix_race_a options=-cstatement_timeout=10000'
);
select public.dblink_connect(
    'matrix_race_b', 'dbname=' || current_database()
        || ' application_name=matrix_race_b options=-cstatement_timeout=10000'
);
select public.dblink_exec('matrix_race_a', 'set role service_role');
select public.dblink_exec('matrix_race_b', 'set role service_role');

select public.dblink_send_query('matrix_race_a', pg_catalog.format(
    'select commerce_product_matrix_test.try_update(%L, %L, %s)',
    'race', 'Race winner A', initial_version
)) from commerce_product_matrix_test.products where label = 'race';
select public.dblink_send_query('matrix_race_b', pg_catalog.format(
    'select commerce_product_matrix_test.try_update(%L, %L, %s)',
    'race', 'Race winner B', initial_version
)) from commerce_product_matrix_test.products where label = 'race';

select commerce_product_matrix_test.wait_until_blocked('matrix_race_a');
select commerce_product_matrix_test.wait_until_blocked('matrix_race_b');
commit;
