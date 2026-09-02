\set ON_ERROR_STOP on
create extension if not exists pg_stat_statements;

begin;
delete from commerce.custom_field_definitions
where entity_type = 'variant' and key like 'budgetField%';
insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, options,
    self_editable, admin_editable, enabled, position
)
select 'variant', 'budgetField' || lpad(i::text, 3, '0'),
       'Budget field ' || i, 'string', '[]'::jsonb,
       true, true, true, i
from generate_series(1, 128) i;

create temporary table custom_field_validation_budget (
    field_count integer primary key,
    definition_statements bigint not null,
    definition_time_ms double precision not null
);
set pg_stat_statements.track = 'all';

select pg_stat_statements_reset();
set local role service_role;
select commerce.assert_custom_field_patch('variant', '{}'::jsonb, 'admin');
reset role;
insert into custom_field_validation_budget
select 0, coalesce(sum(calls), 0), coalesce(sum(total_exec_time), 0)
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query ~* '(from|join) commerce\.custom_field_definitions';

select pg_stat_statements_reset();
set local role service_role;
select commerce.assert_custom_field_patch(
    'variant', jsonb_build_object('budgetField001', 'value'), 'admin'
);
reset role;
insert into custom_field_validation_budget
select 1, coalesce(sum(calls), 0), coalesce(sum(total_exec_time), 0)
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query ~* '(from|join) commerce\.custom_field_definitions';

select pg_stat_statements_reset();
set local role service_role;
select commerce.assert_custom_field_patch(
    'variant', (select jsonb_object_agg(
        'budgetField' || lpad(i::text, 3, '0'), 'value'
    ) from generate_series(1, 10) i), 'admin'
);
reset role;
insert into custom_field_validation_budget
select 10, coalesce(sum(calls), 0), coalesce(sum(total_exec_time), 0)
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query ~* '(from|join) commerce\.custom_field_definitions';

select pg_stat_statements_reset();
set local role service_role;
select commerce.assert_custom_field_patch(
    'variant', (select jsonb_object_agg(
        'budgetField' || lpad(i::text, 3, '0'), 'value'
    ) from generate_series(1, 128) i), 'admin'
);
reset role;
insert into custom_field_validation_budget
select 128, coalesce(sum(calls), 0), coalesce(sum(total_exec_time), 0)
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query ~* '(from|join) commerce\.custom_field_definitions';

do $$
begin
    if exists (
        select 1 from custom_field_validation_budget
        where definition_statements <> case when field_count = 0 then 0 else 1 end
    ) then
        raise exception 'custom-field budget: expected one batched definition statement, got %',
            (select jsonb_agg(to_jsonb(result) order by field_count)
             from custom_field_validation_budget result);
    end if;
end;
$$;

table custom_field_validation_budget;
rollback;
