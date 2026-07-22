-- The dispute lookup keeps its later Read Committed observation point.
select provider_reconciliation_test.cleanup();
create extension if not exists dblink;

create function provider_reconciliation_test.wait_for_dispute_application_reader()
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
            join pg_catalog.pg_stat_activity activity on activity.pid = lock_row.pid
            where activity.application_name = 'dispute_application_reader'
              and not lock_row.granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'provider reconciliation: dispute application reader did not block';
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

create table provider_reconciliation_test.dispute_application_scope as
select provider_reconciliation_test.seed_payment(
    'dispute-application-freshness'
) as payment_id;
grant select on provider_reconciliation_test.dispute_application_scope to service_role;

do $fixture$
declare
    v_payment_id bigint := (
        select payment_id from provider_reconciliation_test.dispute_application_scope
    );
begin
    update stripe_connect.payments
    set stripe_charge_id = 'ch_provider_reconciliation_dispute_application_freshness',
        description = 'payment before concurrent commits'
    where id = v_payment_id;
    insert into stripe_connect.stripe_disputes (
        payment_id, stripe_dispute_id, stripe_charge_id, amount, currency,
        status, evidence_status, provider_snapshot
    ) values (
        v_payment_id,
        'dp_provider_reconciliation_pg_dispute_application_freshness',
        'ch_provider_reconciliation_dispute_application_freshness',
        1200, 'eur', 'needs_response', 'not_started',
        '{"id":"dp_provider_reconciliation_pg_dispute_application_freshness"}'::jsonb
    );
end;
$fixture$;

select dblink_connect(
    'dispute_application_reader',
    'dbname=' || current_database() || ' application_name=dispute_application_reader'
);
select dblink_connect('dispute_application_blocker', 'dbname=' || current_database());
select dblink_connect('dispute_application_writer', 'dbname=' || current_database());
select dblink_exec('dispute_application_reader', 'set role service_role');
select dblink_exec('dispute_application_writer', 'set role service_role');
select dblink_exec('dispute_application_blocker', 'begin');
select dblink_exec(
    'dispute_application_blocker',
    'lock table stripe_connect.stripe_disputes in access exclusive mode'
);
select dblink_exec(
    'dispute_application_blocker',
    $$update stripe_connect.stripe_disputes set evidence_status = 'submitted'
      where stripe_dispute_id =
        'dp_provider_reconciliation_pg_dispute_application_freshness'$$
);
select dblink_send_query(
    'dispute_application_reader',
    $$select payment, dispute
      from stripe_connect.read_stripe_dispute_application_context(
        'ch_provider_reconciliation_dispute_application_freshness',
        'dp_provider_reconciliation_pg_dispute_application_freshness'
      )$$
);
select provider_reconciliation_test.wait_for_dispute_application_reader();
select dblink_exec(
    'dispute_application_writer',
    $$update stripe_connect.payments
      set description = 'payment committed after first context read'
      where client_reference_id =
        'provider-reconciliation-pg-dispute-application-freshness'$$
);
select dblink_exec('dispute_application_blocker', 'commit');

do $freshness$
declare
    v_context record;
begin
    select * into strict v_context
    from dblink_get_result('dispute_application_reader')
        as result(payment jsonb, dispute jsonb);
    if v_context.payment ->> 'description' <> 'payment before concurrent commits'
       or v_context.dispute ->> 'evidence_status' <> 'submitted' then
        raise exception 'provider reconciliation: dispute application snapshots changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$freshness$;

select dblink_disconnect('dispute_application_reader');
select dblink_disconnect('dispute_application_blocker');
select dblink_disconnect('dispute_application_writer');
select provider_reconciliation_test.cleanup();
