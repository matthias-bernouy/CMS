select label_access_test.cleanup();
create extension if not exists dblink;

select label_access_test.seed(
    'crossed-expiry', '6', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/crossed-expiry.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);

select dblink_connect(
    'label_expiry_reader',
    'dbname=' || current_database()
        || ' application_name=label_expiry_reader'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'label_expiry_blocker',
    'dbname=' || current_database()
        || ' application_name=label_expiry_blocker'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('label_expiry_reader', 'set role service_role');
select dblink_exec('label_expiry_blocker', 'begin');
select dblink_exec(
    'label_expiry_blocker',
    'lock table delivery.label_access_tokens in access exclusive mode'
);
select dblink_send_query(
    'label_expiry_reader',
    $$select delivery.get_label_access_context(
        pg_catalog.repeat('6', 64), 'label-access-pg-seller'
    )$$
);
select label_access_test.wait_for_reader('label_expiry_reader');
select dblink_exec(
    'label_expiry_blocker',
    $$update delivery.label_access_tokens
      set expires_at = pg_catalog.clock_timestamp()
      where token_hash = pg_catalog.repeat('6', 64)$$
);
select dblink_exec('label_expiry_blocker', 'commit');

create temporary table label_expiry_result as
select result.context
from dblink_get_result('label_expiry_reader')
    as result(context jsonb);

do $expiry$
begin
    if (select context from label_expiry_result) is distinct from
        '{"state":"expired"}'::jsonb then
        raise exception 'label access: expiry was frozen before database token read: %',
            (select context from label_expiry_result);
    end if;
end;
$expiry$;

select dblink_disconnect('label_expiry_reader');
select dblink_disconnect('label_expiry_blocker');
select label_access_test.cleanup();
