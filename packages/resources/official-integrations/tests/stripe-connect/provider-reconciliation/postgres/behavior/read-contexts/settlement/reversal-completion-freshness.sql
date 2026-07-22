-- Each embedded SELECT keeps its own Read Committed observation point.
select provider_reconciliation_test.cleanup();
create extension if not exists dblink;

create function provider_reconciliation_test.wait_for_completion_connection(
    p_application_name text
)
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
            where activity.application_name = p_application_name
              and not lock_row.granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'provider reconciliation: completion connection did not block: %',
                p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

create function provider_reconciliation_test.commit_completion_interleaving(
    p_payment_id bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
    lock table stripe_connect.payments in access exclusive mode;
    update stripe_connect.transfer_reversals
    set status = 'succeeded'
    where reversal_request_id =
        'provider-reconciliation-pg-transfer-reversal-completion-freshness-late';
    if not found then
        raise exception 'provider reconciliation: completion reversal disappeared';
    end if;
    update stripe_connect.payments
    set description = 'payment committed after reversal sum',
        settlement_status = 'manual_review'
    where id = p_payment_id;
    if not found then
        raise exception 'provider reconciliation: completion payment disappeared';
    end if;
    return true;
end;
$$;

create table provider_reconciliation_test.completion_scope as
select provider_reconciliation_test.seed_payment(
    'transfer-reversal-completion-freshness'
) as payment_id;
grant select on provider_reconciliation_test.completion_scope to service_role;

do $fixture$
declare
    v_payment_id bigint := (
        select payment_id from provider_reconciliation_test.completion_scope
    );
    v_transfer_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'transfer-reversal-completion-freshness-transfer', 'transfer_create'
    );
    v_transfer_id bigint;
    v_operation_id bigint;
begin
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        source_charge_id, destination_account_id, transfer_group,
        amount, currency, status
    ) values (
        v_payment_id, v_transfer_operation_id,
        'provider-reconciliation-pg-transfer-reversal-completion-freshness-release',
        'initial', 'ch_provider_reconciliation_completion_freshness',
        'acct_provider_reconciliation_transfer-reversal-completion-freshness',
        'provider_reconciliation_transfer_reversal_completion_freshness',
        500, 'eur', 'succeeded'
    ) returning id into v_transfer_id;

    v_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'transfer-reversal-completion-freshness-included',
        'transfer_reversal_create'
    );
    insert into stripe_connect.transfer_reversals (
        payment_id, transfer_id, operation_id, reversal_request_id,
        amount, currency, status
    ) values (
        v_payment_id, v_transfer_id, v_operation_id,
        'provider-reconciliation-pg-transfer-reversal-completion-freshness-included',
        100, 'eur', 'succeeded'
    );
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'transfer-reversal-completion-freshness-late',
        'transfer_reversal_create'
    );
    insert into stripe_connect.transfer_reversals (
        payment_id, transfer_id, operation_id, reversal_request_id,
        amount, currency, status
    ) values (
        v_payment_id, v_transfer_id, v_operation_id,
        'provider-reconciliation-pg-transfer-reversal-completion-freshness-late',
        200, 'eur', 'reserved'
    );
end;
$fixture$;

select dblink_connect('completion_reader',
    'dbname=' || current_database() || ' application_name=completion_reader');
select dblink_connect('completion_writer',
    'dbname=' || current_database() || ' application_name=completion_writer');
select dblink_connect('completion_blocker', 'dbname=' || current_database());
select dblink_exec('completion_reader', 'set role service_role');
select dblink_exec('completion_blocker', 'begin');
select dblink_exec('completion_blocker',
    'lock table stripe_connect.payments in access exclusive mode');
select dblink_send_query('completion_writer',
    $$select provider_reconciliation_test.commit_completion_interleaving(
        (select payment_id from provider_reconciliation_test.completion_scope)
      )$$);
select provider_reconciliation_test.wait_for_completion_connection('completion_writer');
select dblink_send_query('completion_reader',
    $$select reversed_amount, payment
      from stripe_connect.read_transfer_reversal_completion_context(
        (select payment_id from provider_reconciliation_test.completion_scope)
      )$$);
select provider_reconciliation_test.wait_for_completion_connection('completion_reader');
select dblink_exec('completion_blocker', 'commit');

create temporary table completion_writer_result as
select result.completed
from dblink_get_result('completion_writer') as result(completed boolean);
create temporary table completion_reader_result as
select result.reversed_amount, result.payment
from dblink_get_result('completion_reader')
    as result(reversed_amount numeric, payment jsonb);

do $freshness$
declare
    v_context record;
    v_succeeded_total numeric;
begin
    if not (select completed from completion_writer_result) then
        raise exception 'provider reconciliation: completion writer did not finish';
    end if;
    select * into strict v_context from completion_reader_result;
    select coalesce(pg_catalog.sum(amount), 0) into strict v_succeeded_total
    from stripe_connect.transfer_reversals
    where payment_id = (select payment_id from provider_reconciliation_test.completion_scope)
      and status = 'succeeded';
    if v_context.reversed_amount <> 100
       or v_context.payment ->> 'description' <> 'payment committed after reversal sum'
       or v_context.payment ->> 'settlement_status' <> 'manual_review'
       or v_succeeded_total <> 300 then
        raise exception 'provider reconciliation: completion snapshots changed: % / %',
            pg_catalog.to_jsonb(v_context), v_succeeded_total;
    end if;
end;
$freshness$;

select dblink_disconnect('completion_reader');
select dblink_disconnect('completion_writer');
select dblink_disconnect('completion_blocker');
select provider_reconciliation_test.cleanup();
