select provider_reconciliation_test.cleanup();
create extension if not exists dblink;

do $required_rpc$
begin
    if pg_catalog.to_regprocedure(
        'stripe_connect.reserve_payment_cancellation_operation(bigint,text,text,jsonb)'
    ) is null then
        raise exception 'provider reconciliation: missing future cancellation operation RPC';
    end if;
end;
$required_rpc$;

create table provider_reconciliation_test.cancellation_operation_scope as
select provider_reconciliation_test.seed_payment(
    'cancellation-operation-freshness'
) as payment_id;
grant select on provider_reconciliation_test.cancellation_operation_scope
to service_role;

create function provider_reconciliation_test.wait_for_cancellation_operation()
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
            where activity.application_name = 'cancellation_operation_reader'
              and not lock_row.granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'provider reconciliation: cancellation operation reader did not block';
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

select dblink_connect(
    'cancellation_operation_reader',
    'dbname=' || current_database()
        || ' application_name=cancellation_operation_reader'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'cancellation_operation_blocker',
    'dbname=' || current_database()
        || ' application_name=cancellation_operation_blocker'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('cancellation_operation_reader', 'set role service_role');
select dblink_exec('cancellation_operation_blocker', 'set role service_role');
select dblink_exec('cancellation_operation_blocker', 'begin');
select dblink_exec(
    'cancellation_operation_blocker',
    $$update stripe_connect.payments
      set description = 'committed while reservation blocked'
      where id = (
        select payment_id
        from provider_reconciliation_test.cancellation_operation_scope
      )$$
);
select dblink_send_query(
    'cancellation_operation_reader',
    $$select result.payment, result.operation
      from stripe_connect.reserve_payment_cancellation_operation(
        (select payment_id
         from provider_reconciliation_test.cancellation_operation_scope),
        'provider-reconciliation-pg-cancellation-operation-freshness',
        'provider-reconciliation-pg-cancellation-operation-freshness',
        '{"clientReferenceId":"provider-reconciliation-pg-cancellation-operation-freshness","cancellationRequestId":"cancellation-operation-freshness","reason":"buyer cancelled"}'::jsonb
      ) result$$
);
select provider_reconciliation_test.wait_for_cancellation_operation();
select dblink_exec('cancellation_operation_blocker', 'commit');

create temporary table cancellation_operation_freshness_result as
select result.payment, result.operation
from dblink_get_result('cancellation_operation_reader')
    as result(payment jsonb, operation jsonb);

do $freshness$
declare
    v_result record;
    v_current_description text;
begin
    select * into strict v_result
    from cancellation_operation_freshness_result;
    select payment.description into strict v_current_description
    from stripe_connect.payments payment
    where payment.id = (
        select payment_id
        from provider_reconciliation_test.cancellation_operation_scope
    );
    if v_result.payment->>'description' is not null
       or v_current_description <> 'committed while reservation blocked'
       or v_result.operation->>'operation_type' <> 'payment_intent_cancel'
       or v_result.operation->>'business_key'
            <> 'provider-reconciliation-pg-cancellation-operation-freshness' then
        raise exception 'provider reconciliation: cancellation snapshots changed: %',
            pg_catalog.to_jsonb(v_result);
    end if;
end;
$freshness$;

select dblink_disconnect('cancellation_operation_reader');
select dblink_disconnect('cancellation_operation_blocker');
drop table cancellation_operation_freshness_result;
select provider_reconciliation_test.cleanup();
