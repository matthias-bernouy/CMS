-- A VOLATILE PL/pgSQL read context must take a fresh Read Committed snapshot
-- for each embedded SELECT, rather than pinning the caller's snapshot.
select provider_reconciliation_test.cleanup();
create extension if not exists dblink;

do $fixture$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'settlement-freshness'
    );
    v_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'settlement-freshness-refund', 'refund_create'
    );
    v_ledger_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'settlement-freshness-ledger-refund', 'refund_create'
    );
begin
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_charge_id,
        amount, seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, status
    ) values (
        v_payment_id, v_operation_id,
        'provider-reconciliation-pg-settlement-freshness-refund',
        'ch_provider_reconciliation_settlement_freshness',
        100, 75, 1005, 'eur', 'reserved'
    );
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_charge_id,
        amount, seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, status
    ) values (
        v_payment_id, v_ledger_operation_id,
        'provider-reconciliation-pg-settlement-freshness-ledger-refund',
        'ch_provider_reconciliation_settlement_freshness',
        100, 25, 980, 'eur', 'reserved'
    );
end;
$fixture$;

create function provider_reconciliation_test.wait_for_settlement_reader()
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
            where activity.application_name = 'settlement_freshness_reader'
              and not lock_row.granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'provider reconciliation: settlement reader did not block';
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

select dblink_connect(
    'settlement_freshness_reader',
    'dbname=' || current_database()
        || ' application_name=settlement_freshness_reader'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'settlement_freshness_blocker',
    'dbname=' || current_database()
        || ' application_name=settlement_freshness_blocker'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'settlement_freshness_writer',
    'dbname=' || current_database()
        || ' application_name=settlement_freshness_writer'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('settlement_freshness_reader', 'set role service_role');
select dblink_exec('settlement_freshness_writer', 'set role service_role');
select dblink_exec('settlement_freshness_blocker', 'begin');
select dblink_exec(
    'settlement_freshness_blocker',
    'lock table stripe_connect.transfers in access exclusive mode'
);
select dblink_send_query(
    'settlement_freshness_reader',
    $$select seller_recovery_amount
      from stripe_connect.read_settlement_release_context(
        (select id from stripe_connect.payments
         where client_reference_id = 'provider-reconciliation-pg-settlement-freshness'),
        'provider-reconciliation-pg-seller-settlement-freshness',
        'provider-reconciliation-pg-settlement-freshness-missing-transfer'
      )$$
);

select provider_reconciliation_test.wait_for_settlement_reader();

select dblink_exec(
    'settlement_freshness_writer',
    $$update stripe_connect.refunds
      set status = 'succeeded'
      where refund_request_id =
        'provider-reconciliation-pg-settlement-freshness-refund'$$
);
select dblink_exec('settlement_freshness_blocker', 'commit');

create temporary table settlement_freshness_context_result as
select result.seller_recovery_amount
from dblink_get_result('settlement_freshness_reader')
    as result(seller_recovery_amount numeric);

do $freshness$
declare
    v_seller_recovery_amount numeric;
begin
    select result.seller_recovery_amount
    into strict v_seller_recovery_amount
    from settlement_freshness_context_result result;
    if v_seller_recovery_amount <> 75 then
        raise exception 'provider reconciliation: settlement snapshot was stale: %',
            v_seller_recovery_amount;
    end if;
end;
$freshness$;
drop table settlement_freshness_context_result;
select pg_catalog.count(*) from dblink_get_result('settlement_freshness_reader')
    as result(seller_recovery_amount numeric);
select dblink_exec('settlement_freshness_blocker', 'begin');
select dblink_exec(
    'settlement_freshness_blocker',
    'lock table stripe_connect.transfer_reversals in access exclusive mode'
);
select dblink_send_query(
    'settlement_freshness_reader',
    $$select transferred_amount, reversed_amount, seller_recovery_amount
      from stripe_connect.read_settlement_release_ledger(
        (select id from stripe_connect.payments
         where client_reference_id = 'provider-reconciliation-pg-settlement-freshness')
      )$$
);
select provider_reconciliation_test.wait_for_settlement_reader();
select dblink_exec(
    'settlement_freshness_writer',
    $$update stripe_connect.refunds
      set status = 'succeeded'
      where refund_request_id =
        'provider-reconciliation-pg-settlement-freshness-ledger-refund'$$
);
select dblink_exec('settlement_freshness_blocker', 'commit');

do $ledger_freshness$
declare
    v_result record;
begin
    select * into strict v_result
    from dblink_get_result('settlement_freshness_reader') as result(
        transferred_amount numeric,
        reversed_amount numeric,
        seller_recovery_amount numeric
    );
    if v_result.transferred_amount <> 0
       or v_result.reversed_amount <> 0
       or v_result.seller_recovery_amount <> 100 then
        raise exception 'provider reconciliation: settlement ledger snapshot was stale: %',
            pg_catalog.to_jsonb(v_result);
    end if;
end;
$ledger_freshness$;

select dblink_disconnect('settlement_freshness_reader');
select dblink_disconnect('settlement_freshness_blocker');
select dblink_disconnect('settlement_freshness_writer');
select provider_reconciliation_test.cleanup();
