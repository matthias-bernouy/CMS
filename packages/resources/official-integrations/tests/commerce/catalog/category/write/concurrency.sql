\set ON_ERROR_STOP on
create extension if not exists dblink;

set role service_role;
delete from commerce.categories where slug = 'category-write-race';
delete from commerce.custom_field_definitions
where entity_type = 'product' and key like 'writeRace%';

select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'category-write-race', 'label', 'Category write race'
))->>'id')::bigint category_id \gset
select set_config('test.category_race_id', :'category_id', false);
select commerce.upsert_custom_field(
    'product', key, label, 'string', '[]'::jsonb,
    false, false, true, true, true, position, true, null
)
from (values
    ('writeRaceAlpha', 'Race alpha', 0),
    ('writeRaceBeta', 'Race beta', 1),
    ('writeRaceBoolean', 'Race boolean', 2),
    ('writeRaceNumber', 'Race number', 3)
) definition(key, label, position);
reset role;

select dblink_connect('category_write_a', 'dbname=' || current_database());
select dblink_connect('category_write_b', 'dbname=' || current_database());
select dblink_exec('category_write_a', 'set role service_role');
select dblink_exec('category_write_b', 'set role service_role');

begin;
lock table commerce.category_custom_fields in access exclusive mode;
select dblink_send_query('category_write_a', format(
    'select commerce.sync_category_custom_fields(%s, %L::jsonb)',
    :category_id,
    '[{"fieldKey":"writeRaceAlpha","position":0},{"fieldKey":"writeRaceBeta","position":1}]'
));
select dblink_send_query('category_write_b', format(
    'select commerce.sync_category_custom_fields(%s, %L::jsonb)',
    :category_id,
    '[{"fieldKey":"writeRaceBoolean","position":0},{"fieldKey":"writeRaceNumber","position":1}]'
));
select pg_sleep(0.05);
commit;

create temporary table category_write_responses(name text primary key, response jsonb);
insert into category_write_responses
select 'a', response from dblink_get_result('category_write_a') result(response jsonb);
insert into category_write_responses
select 'b', response from dblink_get_result('category_write_b') result(response jsonb);

do $$
declare
    v_category_id bigint := current_setting('test.category_race_id')::bigint;
    v_keys text[];
    v_response_keys text[];
begin
    select array_agg(field_key order by field_key) into v_keys
    from commerce.category_custom_fields where category_id = v_category_id;
    if v_keys not in (
        array['writeRaceAlpha', 'writeRaceBeta'],
        array['writeRaceBoolean', 'writeRaceNumber']
    ) then
        raise exception 'category write concurrency: invalid final replacement %', v_keys;
    end if;
    select array_agg(field->>'fieldKey' order by field->>'fieldKey') into v_response_keys
    from category_write_responses, jsonb_array_elements(response->'fields') field
    where name = 'a';
    if v_response_keys is distinct from array['writeRaceAlpha', 'writeRaceBeta'] then
        raise exception 'category write concurrency: invalid response A %', v_response_keys;
    end if;
    select array_agg(field->>'fieldKey' order by field->>'fieldKey') into v_response_keys
    from category_write_responses, jsonb_array_elements(response->'fields') field
    where name = 'b';
    if v_response_keys is distinct from array['writeRaceBoolean', 'writeRaceNumber'] then
        raise exception 'category write concurrency: invalid response B %', v_response_keys;
    end if;
end;
$$;

select dblink_disconnect('category_write_a');
select dblink_disconnect('category_write_b');
set role service_role;
delete from commerce.categories where id = :category_id;
delete from commerce.custom_field_definitions
where entity_type = 'product' and key like 'writeRace%';
reset role;
