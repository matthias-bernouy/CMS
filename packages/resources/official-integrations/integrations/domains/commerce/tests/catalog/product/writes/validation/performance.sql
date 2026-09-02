\set ON_ERROR_STOP on
-- PostgreSQL must preload pg_stat_statements so nested PL/pgSQL calls are observable.
create extension if not exists pg_stat_statements;

create function pg_temp.assert_product_matrix_write_budget(p_max_calls bigint)
returns void language plpgsql as $$
declare v_calls bigint;
begin
    select coalesce(sum(statements.calls), 0) into v_calls
    from pg_stat_statements statements
    where statements.dbid = (
        select database.oid from pg_database database
        where database.datname = current_database()
    ) and statements.query not ilike '%pg_stat_statements%'
      and statements.query not like '%FROM ONLY "commerce"%';
    if v_calls > p_max_calls then
        raise exception 'product matrix write budget: expected at most % statements, got %',
            p_max_calls, v_calls;
    end if;
end;
$$;

begin;
set local role service_role;
select (commerce.upsert_product_read_model(null, jsonb_build_object(
    'slug', 'product-matrix-write-budget',
    'title', 'Product matrix write budget',
    'status', 'active',
    'visibility', 'public'
), null)->'product'->>'id')::bigint product_id \gset
reset role;

create temporary table product_matrix_write_payload as
with axis_specs(axis_key, axis_label, value_count, position) as (
    values ('a', 'Axis A', 2, 0), ('b', 'Axis B', 2, 1),
           ('c', 'Axis C', 5, 2), ('d', 'Axis D', 5, 3)
), axes as (
    select jsonb_agg(jsonb_build_object(
        'key', spec.axis_key,
        'label', spec.axis_label,
        'position', spec.position,
        'values', (
            select jsonb_agg(jsonb_build_object(
                'key', spec.axis_key || value_index,
                'label', spec.axis_label || ' ' || value_index,
                'position', value_index - 1
            ) order by value_index)
            from generate_series(1, spec.value_count) value_index
        )
    ) order by spec.position) value
    from axis_specs spec
), matrix as (
    select jsonb_agg(jsonb_build_object(
        'key', format('a:a%s|b:b%s|c:c%s|d:d%s', a, b, c, d),
        'title', format('Variant %s-%s-%s-%s', a, b, c, d),
        'status', 'active',
        'position', (((a - 1) * 2 + b - 1) * 5 + c - 1) * 5 + d - 1,
        'choices', jsonb_build_array(
            jsonb_build_object('axisKey', 'a', 'valueKey', 'a' || a),
            jsonb_build_object('axisKey', 'b', 'valueKey', 'b' || b),
            jsonb_build_object('axisKey', 'c', 'valueKey', 'c' || c),
            jsonb_build_object('axisKey', 'd', 'valueKey', 'd' || d)
        )
    ) order by a, b, c, d) value
    from generate_series(1, 2) a
    cross join generate_series(1, 2) b
    cross join generate_series(1, 5) c
    cross join generate_series(1, 5) d
)
select axes.value axes, matrix.value matrix from axes cross join matrix;

set pg_stat_statements.track = 'all';
select pg_stat_statements_reset();
select commerce.sync_product_variant_matrix(:product_id, axes, matrix)
from product_matrix_write_payload;
select pg_temp.assert_product_matrix_write_budget(50);

rollback;
