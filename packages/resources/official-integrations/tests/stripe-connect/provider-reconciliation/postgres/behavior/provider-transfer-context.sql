select provider_reconciliation_test.cleanup();

do $provider_transfer_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment('transfer-context');
    v_other_payment_id bigint := provider_reconciliation_test.seed_payment('transfer-context-other');
    v_operation_id bigint;
    v_transfer_id bigint;
    v_other_transfer_id bigint;
    v_context record;
    v_status text;
    v_index integer;
    v_statuses text[] := array['succeeded', 'succeeded', 'failed', 'processing', 'manual_review'];
begin
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'transfer-context-transfer', 'transfer_create'
    );
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        stripe_transfer_id, source_charge_id, destination_account_id,
        transfer_group, amount, currency, status, provider_snapshot
    ) values (
        v_payment_id, v_operation_id,
        'provider-reconciliation-pg-transfer-context-release', 'initial',
        'tr_provider_reconciliation_context',
        'ch_provider_reconciliation_context', 'acct_provider_reconciliation_context',
        'provider_reconciliation_context', 1080, 'eur', 'succeeded',
        '{"id":"tr_provider_reconciliation_context"}'::jsonb
    ) returning id into v_transfer_id;

    for v_index in 1..pg_catalog.array_length(v_statuses, 1) loop
        v_status := v_statuses[v_index];
        v_operation_id := provider_reconciliation_test.seed_operation(
            v_payment_id, 'transfer-context-reversal-' || v_index,
            'transfer_reversal_create'
        );
        insert into stripe_connect.transfer_reversals (
            payment_id, transfer_id, operation_id, reversal_request_id,
            amount, currency, status
        ) values (
            v_payment_id, v_transfer_id, v_operation_id,
            'provider-reconciliation-pg-transfer-context-reversal-' || v_index,
            case v_index when 1 then 120 when 2 then 80 else 999 end,
            'eur', v_status
        );
    end loop;

    v_operation_id := provider_reconciliation_test.seed_operation(
        v_other_payment_id, 'transfer-context-other-transfer', 'transfer_create'
    );
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        stripe_transfer_id, source_charge_id, destination_account_id,
        transfer_group, amount, currency, status
    ) values (
        v_other_payment_id, v_operation_id,
        'provider-reconciliation-pg-transfer-context-other-release', 'initial',
        'tr_provider_reconciliation_context_other',
        'ch_provider_reconciliation_context_other',
        'acct_provider_reconciliation_context_other',
        'provider_reconciliation_context_other', 999, 'eur', 'succeeded'
    ) returning id into v_other_transfer_id;
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_other_payment_id, 'transfer-context-other-reversal',
        'transfer_reversal_create'
    );
    insert into stripe_connect.transfer_reversals (
        payment_id, transfer_id, operation_id, reversal_request_id,
        amount, currency, status
    ) values (
        v_other_payment_id, v_other_transfer_id, v_operation_id,
        'provider-reconciliation-pg-transfer-context-other-reversal',
        999, 'eur', 'succeeded'
    );

    select * into strict v_context
    from stripe_connect.read_provider_transfer_reconciliation_context(
        'tr_provider_reconciliation_context'
    );
    if (v_context.transfer ->> 'stripe_transfer_id')
            <> 'tr_provider_reconciliation_context'
       or (v_context.transfer ->> 'id')::bigint <> v_transfer_id
       or v_context.local_reversed_amount <> 200 then
        raise exception 'provider reconciliation: transfer context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_provider_transfer_reconciliation_context(
        'tr_provider_reconciliation_missing'
    );
    if v_context.transfer is not null or v_context.local_reversed_amount <> 0 then
        raise exception 'provider reconciliation: missing transfer context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$provider_transfer_context$;
