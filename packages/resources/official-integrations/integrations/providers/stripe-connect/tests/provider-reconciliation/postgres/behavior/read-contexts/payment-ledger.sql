-- Payment-local aggregate read contract.
select provider_reconciliation_test.cleanup();

do $payment_ledger$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment('ledger');
    v_empty_id bigint := provider_reconciliation_test.seed_payment('ledger-empty');
    v_other_id bigint := provider_reconciliation_test.seed_payment('ledger-other');
    v_operation_id bigint;
    v_transfer_id bigint;
    v_other_transfer_id bigint;
    v_ledger record;
    v_index integer;
    v_refund_statuses text[] := array[
        'succeeded', 'succeeded', 'reserved', 'processing',
        'pending', 'failed', 'cancelled', 'manual_review'
    ];
    v_transfer_statuses text[] := array[
        'succeeded', 'partially_reversed', 'reversed', 'reserved',
        'processing', 'failed', 'manual_review'
    ];
    v_reversal_statuses text[] := array[
        'succeeded', 'succeeded', 'reserved', 'processing', 'failed', 'manual_review'
    ];
begin
    for v_index in 1..pg_catalog.array_length(v_refund_statuses, 1) loop
        v_operation_id := provider_reconciliation_test.seed_operation(
            v_payment_id, 'ledger-refund-' || v_index, 'refund_create'
        );
        insert into stripe_connect.refunds (
            payment_id, operation_id, refund_request_id, stripe_charge_id,
            amount, required_reversal_amount,
            seller_entitlement_reduction_amount,
            authorized_seller_amount_after_refund, currency, status
        ) values (
            v_payment_id, v_operation_id,
            'provider-reconciliation-pg-ledger-refund-' || v_index,
            'ch_provider_reconciliation_ledger',
            case v_index when 1 then 120 when 2 then 80 else 1000 end,
            case v_index when 1 then 30 when 2 then 20 else 1000 end,
            case v_index when 1 then 70 when 2 then 50 else 1000 end,
            900, 'eur', v_refund_statuses[v_index]
        );
    end loop;

    for v_index in 1..pg_catalog.array_length(v_transfer_statuses, 1) loop
        v_operation_id := provider_reconciliation_test.seed_operation(
            v_payment_id, 'ledger-transfer-' || v_index, 'transfer_create'
        );
        insert into stripe_connect.transfers (
            payment_id, operation_id, release_authorization_id,
            release_kind, source_charge_id, destination_account_id,
            transfer_group, amount, currency, status
        ) values (
            v_payment_id, v_operation_id,
            'provider-reconciliation-pg-ledger-transfer-' || v_index,
            'initial', 'ch_provider_reconciliation_ledger',
            'acct_provider_reconciliation_ledger',
            'provider_reconciliation_ledger',
            case v_index when 1 then 400 when 2 then 300 when 3 then 200 else 1000 end,
            'eur', v_transfer_statuses[v_index]
        ) returning id into v_transfer_id;
    end loop;

    for v_index in 1..pg_catalog.array_length(v_reversal_statuses, 1) loop
        v_operation_id := provider_reconciliation_test.seed_operation(
            v_payment_id, 'ledger-reversal-' || v_index, 'transfer_reversal_create'
        );
        insert into stripe_connect.transfer_reversals (
            payment_id, transfer_id, operation_id, reversal_request_id,
            amount, currency, status
        ) values (
            v_payment_id, v_transfer_id, v_operation_id,
            'provider-reconciliation-pg-ledger-reversal-' || v_index,
            case v_index when 1 then 125 when 2 then 75 else 1000 end,
            'eur', v_reversal_statuses[v_index]
        );
    end loop;

    v_operation_id := provider_reconciliation_test.seed_operation(
        v_other_id, 'ledger-other-transfer', 'transfer_create'
    );
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        source_charge_id, destination_account_id, transfer_group,
        amount, currency, status
    ) values (
        v_other_id, v_operation_id, 'provider-reconciliation-pg-ledger-other-transfer',
        'initial', 'ch_provider_reconciliation_ledger_other',
        'acct_provider_reconciliation_ledger-other',
        'provider_reconciliation_ledger_other', 999, 'eur', 'succeeded'
    ) returning id into v_other_transfer_id;
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_other_id, 'ledger-other-refund', 'refund_create'
    );
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_charge_id,
        amount, seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, status
    ) values (
        v_other_id, v_operation_id, 'provider-reconciliation-pg-ledger-other-refund',
        'ch_provider_reconciliation_ledger_other', 999, 999, 81, 'eur', 'succeeded'
    );
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_other_id, 'ledger-other-reversal', 'transfer_reversal_create'
    );
    insert into stripe_connect.transfer_reversals (
        payment_id, transfer_id, operation_id, reversal_request_id,
        amount, currency, status
    ) values (
        v_other_id, v_other_transfer_id, v_operation_id,
        'provider-reconciliation-pg-ledger-other-reversal',
        999, 'eur', 'succeeded'
    );

    select * into strict v_ledger
    from stripe_connect.read_payment_reconciliation_ledger(v_payment_id);
    if v_ledger.refunded_amount <> 200
       or v_ledger.transferred_amount <> 900
       or v_ledger.reversed_amount <> 200
       or v_ledger.seller_recovery_amount <> 120 then
        raise exception 'provider reconciliation: payment ledger changed: %',
            pg_catalog.to_jsonb(v_ledger);
    end if;
    select * into strict v_ledger
    from stripe_connect.read_payment_reconciliation_ledger(v_empty_id);
    if pg_catalog.to_jsonb(v_ledger) <> pg_catalog.jsonb_build_object(
        'refunded_amount', 0, 'transferred_amount', 0,
        'reversed_amount', 0, 'seller_recovery_amount', 0
    ) then
        raise exception 'provider reconciliation: empty payment ledger changed: %',
            pg_catalog.to_jsonb(v_ledger);
    end if;
    select * into strict v_ledger
    from stripe_connect.read_payment_reconciliation_ledger(-900000001);
    if v_ledger.refunded_amount <> 0 or v_ledger.transferred_amount <> 0
       or v_ledger.reversed_amount <> 0 or v_ledger.seller_recovery_amount <> 0 then
        raise exception 'provider reconciliation: missing payment ledger changed: %',
            pg_catalog.to_jsonb(v_ledger);
    end if;
end;
$payment_ledger$;

select provider_reconciliation_test.cleanup();
