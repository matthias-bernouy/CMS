select label_access_test.cleanup();
create extension if not exists dblink;

select label_access_test.seed(
    'guard-revoked', 'b', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/guard-revoked.pdf',
    '2026-07-22 10:10:00+00', '2026-07-22 09:55:00+00'
);
select label_access_test.seed(
    'guard-expired', 'c', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/guard-expired.pdf',
    '2026-07-22 09:59:59+00', null
);
select label_access_test.seed(
    'interleaving', '3', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/old.pdf',
    '2026-07-22 10:10:00+00', null
);

create function label_access_test.wait_for_reader(p_application_name text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '5 seconds';
begin
    loop
        exit when exists (
            select 1
            from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity
              on activity.pid = lock_row.pid
            where activity.application_name = p_application_name
              and not lock_row.granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'label access: reader did not reach shipment read';
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

select dblink_connect(
    'label_guard_reader',
    'dbname=' || current_database()
        || ' application_name=label_guard_reader'
        || ' options=-cstatement_timeout=1000'
);
select dblink_connect(
    'label_blocker',
    'dbname=' || current_database()
        || ' application_name=label_blocker'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('label_guard_reader', 'set role service_role');
select dblink_exec('label_blocker', 'begin');
select dblink_exec(
    'label_blocker',
    'lock table delivery.shipments in access exclusive mode'
);

create temporary table label_guard_result as
select result.contexts
from dblink(
    'label_guard_reader',
    $$select pg_catalog.jsonb_build_array(
        delivery.get_label_access_context(
            pg_catalog.repeat('9', 64), 'label-access-pg-seller',
            '2026-07-22 10:00:00+00'
        ),
        delivery.get_label_access_context(
            pg_catalog.repeat('3', 64), 'wrong-seller',
            '2026-07-22 10:00:00+00'
        ),
        delivery.get_label_access_context(
            pg_catalog.repeat('b', 64), 'label-access-pg-seller',
            '2026-07-22 10:00:00+00'
        ),
        delivery.get_label_access_context(
            pg_catalog.repeat('c', 64), 'label-access-pg-seller',
            '2026-07-22 10:00:00+00'
        )
    )$$
) as result(contexts jsonb);

do $guards$
begin
    if (select contexts from label_guard_result) is distinct from
        '[{"state":"not_found"},{"state":"not_found"},{"state":"not_found"},{"state":"expired"}]'::jsonb then
        raise exception 'label access: token refusal short-circuit changed: %',
            (select contexts from label_guard_result);
    end if;
end;
$guards$;
select dblink_exec('label_blocker', 'commit');
select dblink_disconnect('label_guard_reader');

select dblink_connect(
    'label_interleaving_reader',
    'dbname=' || current_database()
        || ' application_name=label_interleaving_reader'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('label_interleaving_reader', 'set role service_role');
select dblink_exec('label_blocker', 'begin');
select dblink_exec(
    'label_blocker',
    $$lock table delivery.shipments in access exclusive mode;
      update delivery.shipments
      set expedition_number = 'label-access-pg-expedition-new',
          label_url = 'https://connect-api-sandbox.mondialrelay.com/labels/new.pdf'
      where id = 'label-access-pg-interleaving'$$
);
select dblink_send_query(
    'label_interleaving_reader',
    $$select delivery.get_label_access_context(
        pg_catalog.repeat('3', 64), 'label-access-pg-seller',
        '2026-07-22 10:00:00+00'
    )$$
);
select label_access_test.wait_for_reader('label_interleaving_reader');
update delivery.label_access_tokens
set revoked_at = '2026-07-22 10:00:01+00'
where token_hash = pg_catalog.repeat('3', 64);
select dblink_exec('label_blocker', 'commit');

create temporary table label_interleaving_result as
select result.context
from dblink_get_result('label_interleaving_reader')
    as result(context jsonb);

do $freshness$
declare
    v_context jsonb := (select context from label_interleaving_result);
begin
    if v_context is distinct from pg_catalog.jsonb_build_object(
        'state', 'ok',
        'shipment', pg_catalog.jsonb_build_object(
            'expedition_number', 'label-access-pg-expedition-new',
            'label_url', 'https://connect-api-sandbox.mondialrelay.com/labels/new.pdf'
        )
    ) then
        raise exception 'label access: token-to-shipment observation order changed: %',
            v_context;
    end if;
end;
$freshness$;

select dblink_disconnect('label_interleaving_reader');
select dblink_disconnect('label_blocker');
select label_access_test.cleanup();
