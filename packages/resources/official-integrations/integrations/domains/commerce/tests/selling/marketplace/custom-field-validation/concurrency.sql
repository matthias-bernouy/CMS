\set ON_ERROR_STOP on
create extension if not exists dblink;

delete from commerce.custom_field_definitions
where entity_type = 'variant' and key = 'validationRace';
insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, options,
    self_editable, admin_editable, enabled
) values (
    'variant', 'validationRace', 'Validation race', 'string', '[]',
    true, true, true
);

select dblink_connect('custom_field_validator', 'dbname=' || current_database());
select dblink_connect('custom_field_writer', 'dbname=' || current_database());
select dblink_exec('custom_field_validator', 'begin; set role service_role');
select dblink_exec('custom_field_writer', 'set role service_role');
select pid from dblink(
    'custom_field_writer', 'select pg_backend_pid()'
) result(pid integer) \gset writer_
select set_config('test.custom_field_writer_pid', :'writer_pid', false);

select result from dblink(
    'custom_field_validator',
    $$select commerce.assert_custom_field_patch(
        'variant', '{"validationRace":"before"}'::jsonb, 'admin'
    )::text$$
) result(result text);

select dblink_send_query(
    'custom_field_writer',
    $$select commerce.upsert_custom_field(
        'variant', 'validationRace', 'Validation race', 'number', '[]'::jsonb,
        false, true, true, false, false, 0, true, null
    )::text$$
);

do $$
declare
    v_deadline timestamptz := clock_timestamp() + interval '2 seconds';
    v_waiting boolean;
begin
    loop
        select wait_event_type = 'Lock' and wait_event = 'advisory'
        into v_waiting
        from pg_stat_activity
        where pid = current_setting('test.custom_field_writer_pid')::integer;
        exit when coalesce(v_waiting, false);
        if clock_timestamp() >= v_deadline then
            raise exception 'custom-field concurrency: writer did not wait for validator';
        end if;
        perform pg_sleep(0.01);
    end loop;
end;
$$;

select dblink_exec('custom_field_validator', 'commit');
select result from dblink_get_result('custom_field_writer') result(result text);

do $$
begin
    if (select field_type from commerce.custom_field_definitions
        where entity_type = 'variant' and key = 'validationRace')
        is distinct from 'number' then
        raise exception 'custom-field concurrency: queued definition update was lost';
    end if;
end;
$$;

select dblink_disconnect('custom_field_validator');
select dblink_disconnect('custom_field_writer');
delete from commerce.custom_field_definitions
where entity_type = 'variant' and key = 'validationRace';
