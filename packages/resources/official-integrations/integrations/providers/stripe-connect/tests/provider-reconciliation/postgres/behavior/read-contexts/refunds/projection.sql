-- Refund projection reads retain their exact sequential observation points.
select provider_reconciliation_test.cleanup();

do $refund_projection_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'refund-projection-context'
    );
    v_empty_id bigint := provider_reconciliation_test.seed_payment(
        'refund-projection-context-empty'
    );
    v_operation_id bigint;
    v_context record;
    v_expected_payment jsonb;
    v_index integer;
    v_statuses text[] := array[
        'succeeded', 'succeeded', 'reserved', 'processing',
        'pending', 'failed', 'cancelled', 'manual_review'
    ];
begin
    for v_index in 1..pg_catalog.array_length(v_statuses, 1) loop
        v_operation_id := provider_reconciliation_test.seed_operation(
            v_payment_id, 'refund-projection-context-' || v_index,
            'refund_create'
        );
        insert into stripe_connect.refunds (
            payment_id, operation_id, refund_request_id, stripe_charge_id,
            amount, seller_entitlement_reduction_amount,
            authorized_seller_amount_after_refund, currency, status,
            actual_stripe_fee_amount
        ) values (
            v_payment_id, v_operation_id,
            'provider-reconciliation-pg-refund-projection-context-' || v_index,
            'ch_provider_reconciliation_refund_projection_context',
            case v_index when 1 then 100 when 2 then 200 else 1000 end,
            case v_index when 1 then 70 when 2 then 50 else 1000 end,
            900, 'eur', v_statuses[v_index],
            case v_index when 1 then -30 when 2 then -20 else 1000 end
        );
    end loop;

    select pg_catalog.to_jsonb(payment) into strict v_expected_payment
    from stripe_connect.payments payment where payment.id = v_payment_id;
    select * into strict v_context
    from stripe_connect.read_refund_projection_context(v_payment_id);
    if pg_catalog.to_jsonb(v_context) <> pg_catalog.jsonb_build_object(
        'refunded_amount', 300,
        'actual_stripe_refund_fee_amount', -50,
        'payment', v_expected_payment,
        'seller_recovery_amount', 120
    ) then
        raise exception 'provider reconciliation: refund projection context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_refund_projection_context(v_empty_id);
    if v_context.refunded_amount <> 0
       or v_context.actual_stripe_refund_fee_amount <> 0
       or (v_context.payment ->> 'id')::bigint <> v_empty_id
       or v_context.seller_recovery_amount <> 0 then
        raise exception 'provider reconciliation: empty refund projection changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_refund_projection_context(-900000001);
    if v_context.refunded_amount <> 0
       or v_context.actual_stripe_refund_fee_amount <> 0
       or v_context.payment is not null
       or v_context.seller_recovery_amount <> 0 then
        raise exception 'provider reconciliation: missing refund projection changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$refund_projection_context$;

select provider_reconciliation_test.cleanup();
create extension if not exists dblink;

create function provider_reconciliation_test.wait_for_refund_projection_reader()
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
            where activity.application_name = 'refund_projection_reader'
              and not lock_row.granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'provider reconciliation: refund projection reader did not block';
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

create table provider_reconciliation_test.refund_projection_scope as
select provider_reconciliation_test.seed_payment(
    'refund-projection-freshness'
) as payment_id;
grant select on provider_reconciliation_test.refund_projection_scope to service_role;

do $freshness_fixture$
declare
    v_payment_id bigint := (
        select payment_id from provider_reconciliation_test.refund_projection_scope
    );
    v_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'refund-projection-freshness', 'refund_create'
    );
begin
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_charge_id,
        amount, seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, status,
        actual_stripe_fee_amount
    ) values (
        v_payment_id, v_operation_id,
        'provider-reconciliation-pg-refund-projection-freshness',
        'ch_provider_reconciliation_refund_projection_freshness',
        100, 75, 1005, 'eur', 'reserved', -20
    );
end;
$freshness_fixture$;

select dblink_connect('refund_projection_reader',
    'dbname=' || current_database() || ' application_name=refund_projection_reader');
select dblink_connect('refund_projection_blocker', 'dbname=' || current_database());
select dblink_connect('refund_projection_writer', 'dbname=' || current_database());
select dblink_exec('refund_projection_reader', 'set role service_role');
select dblink_exec('refund_projection_writer', 'set role service_role');
select dblink_exec('refund_projection_blocker', 'begin');
select dblink_exec('refund_projection_blocker',
    'lock table stripe_connect.payments in access exclusive mode');
select dblink_send_query('refund_projection_reader',
    $$select refunded_amount, actual_stripe_refund_fee_amount,
             payment, seller_recovery_amount
      from stripe_connect.read_refund_projection_context(
        (select payment_id
         from provider_reconciliation_test.refund_projection_scope)
      )$$);
select provider_reconciliation_test.wait_for_refund_projection_reader();
select dblink_exec('refund_projection_writer',
    $$update stripe_connect.refunds set status = 'succeeded'
      where refund_request_id =
        'provider-reconciliation-pg-refund-projection-freshness'$$);
select dblink_exec('refund_projection_blocker', 'commit');

do $freshness$
declare
    v_context record;
begin
    select * into strict v_context
    from dblink_get_result('refund_projection_reader') as result(
        refunded_amount numeric, actual_stripe_refund_fee_amount numeric,
        payment jsonb, seller_recovery_amount numeric
    );
    if v_context.refunded_amount <> 0
       or v_context.actual_stripe_refund_fee_amount <> 0
       or v_context.payment is null
       or v_context.seller_recovery_amount <> 75 then
        raise exception 'provider reconciliation: refund projection snapshot was stale: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$freshness$;

select dblink_disconnect('refund_projection_reader');
select dblink_disconnect('refund_projection_blocker');
select dblink_disconnect('refund_projection_writer');
select provider_reconciliation_test.cleanup();
