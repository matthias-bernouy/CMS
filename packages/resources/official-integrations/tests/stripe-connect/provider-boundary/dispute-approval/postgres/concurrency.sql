select dispute_approval_test.cleanup();

insert into dispute_approval_test.concurrency_state (dispute_id)
values (dispute_approval_test.seed('concurrency', 1000));

select pg_catalog.pg_advisory_lock(743107);
select dblink_connect(
    'dispute_approval_a',
    'dbname=' || current_database()
        || ' application_name=dispute_approval_a'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'dispute_approval_b',
    'dbname=' || current_database()
        || ' application_name=dispute_approval_b'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('dispute_approval_a', 'set role service_role');
select dblink_exec('dispute_approval_b', 'set role service_role');
select dblink_send_query(
    'dispute_approval_a',
    $$select dispute_approval_test.concurrent_attempt('admin-first') as result$$
);
select dispute_approval_test.wait_until_blocked('dispute_approval_a');
select dblink_send_query(
    'dispute_approval_b',
    $$select dispute_approval_test.concurrent_attempt('admin-second') as result$$
);

create temporary table dispute_approval_results (result jsonb not null);
insert into dispute_approval_results
select result
from dblink_get_result('dispute_approval_b') as response(result jsonb);
select pg_catalog.pg_advisory_unlock(743107);
insert into dispute_approval_results
select result
from dblink_get_result('dispute_approval_a') as response(result jsonb);

do $concurrency$
declare
    v_approval stripe_connect.irreversible_dispute_action_approvals%rowtype;
begin
    select approval.* into strict v_approval
    from stripe_connect.irreversible_dispute_action_approvals approval
    where approval.action_key = 'dispute-approval-pg-concurrency';
    if (select pg_catalog.count(*) from dispute_approval_results) <> 2
       or (select pg_catalog.count(*) from dispute_approval_results
           where result->>'approvalStatus' = 'pending_second_approval') <> 1
       or (select pg_catalog.count(*) from dispute_approval_results
           where result->>'approvalStatus' = 'approved') <> 1
       or v_approval.status <> 'approved'
       or array[v_approval.first_actor_id, v_approval.second_actor_id]
            @> array['admin-first', 'admin-second']
       is not true then
        raise exception 'dispute approval: concurrent actors diverged: %',
            (select pg_catalog.jsonb_agg(result) from dispute_approval_results);
    end if;
end;
$concurrency$;

select dblink_disconnect('dispute_approval_a');
select dblink_disconnect('dispute_approval_b');
drop trigger dispute_approval_concurrency_barrier
on stripe_connect.irreversible_dispute_action_approvals;
drop table dispute_approval_results;
select dispute_approval_test.cleanup();
