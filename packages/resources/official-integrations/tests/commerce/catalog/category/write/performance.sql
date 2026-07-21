\set ON_ERROR_STOP on
-- PostgreSQL must preload pg_stat_statements so nested PL/pgSQL calls are observable.
create extension if not exists pg_stat_statements;

create function pg_temp.assert_category_write_budget(p_max_calls bigint)
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
        raise exception 'category write budget: expected at most % statements, got %',
            p_max_calls, v_calls;
    end if;
end;
$$;

begin;
set local role service_role;
select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'category-write-budget', 'label', 'Category write budget'
))->>'id')::bigint category_id \gset
insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, public_readable,
    show_in_dashboard_table, position
)
select 'product', 'writeBudget' || lpad(i::text, 3, '0'), 'Budget ' || i,
       'string', true, true, i
from generate_series(1, 100) i;
reset role;

set pg_stat_statements.track = 'all';
select pg_stat_statements_reset();
select jsonb_array_length(commerce.sync_category_custom_fields(
    :category_id,
    (select jsonb_agg(jsonb_build_object(
        'fieldKey', 'writeBudget' || lpad(i::text, 3, '0'),
        'required', i % 2 = 0,
        'filterable', i % 3 = 0,
        'position', i - 1
    ) order by i) from generate_series(1, 100) i)
)->'fields');
select pg_temp.assert_category_write_budget(8);

rollback;
