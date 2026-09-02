select payout_schedule_test.cleanup();

insert into payout_schedule_test.concurrency_state (cms_user_id)
values (payout_schedule_test.seed('concurrency', true));

select pg_catalog.pg_advisory_lock(743108);
select dblink_connect(
    'payout_schedule_a',
    'dbname=' || current_database()
        || ' application_name=payout_schedule_a'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'payout_schedule_b',
    'dbname=' || current_database()
        || ' application_name=payout_schedule_b'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('payout_schedule_a', 'set role service_role');
select dblink_exec('payout_schedule_b', 'set role service_role');
select dblink_send_query(
    'payout_schedule_a',
    $$select payout_schedule_test.concurrent_attempt('owner-first') as result$$
);
select payout_schedule_test.wait_until_blocked('payout_schedule_a');
select dblink_send_query(
    'payout_schedule_b',
    $$select payout_schedule_test.concurrent_attempt('owner-second') as result$$
);
select payout_schedule_test.wait_until_blocked('payout_schedule_b');

create temporary table payout_schedule_results (result jsonb not null);
select pg_catalog.pg_advisory_unlock(743108);
insert into payout_schedule_results
select result
from dblink_get_result('payout_schedule_a') as response(result jsonb);
insert into payout_schedule_results
select result
from dblink_get_result('payout_schedule_b') as response(result jsonb);

do $concurrency$
declare
    v_account stripe_connect.accounts%rowtype;
begin
    select account.* into strict v_account
    from stripe_connect.accounts account
    where account.cms_user_id = 'payout-schedule-pg-concurrency';
    if (select pg_catalog.count(*) from payout_schedule_results) <> 2
       or (select pg_catalog.count(*) from payout_schedule_results
           where result->>'claimed' = 'true') <> 1
       or (select pg_catalog.count(*) from payout_schedule_results
           where result->>'claimed' = 'false') <> 1
       or v_account.payout_hold_claimed_by <> 'owner-first'
       or v_account.payout_hold_claimed_at is null then
        raise exception 'payout schedule: concurrent claims diverged: %',
            (select pg_catalog.jsonb_agg(result) from payout_schedule_results);
    end if;
end;
$concurrency$;

select dblink_disconnect('payout_schedule_a');
select dblink_disconnect('payout_schedule_b');
drop trigger payout_schedule_claim_barrier on stripe_connect.accounts;
drop table payout_schedule_results;
select payout_schedule_test.cleanup();
