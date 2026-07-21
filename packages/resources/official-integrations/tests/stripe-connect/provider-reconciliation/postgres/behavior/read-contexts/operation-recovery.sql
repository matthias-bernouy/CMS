-- Financial-operation recovery read-context contract.
select provider_reconciliation_test.cleanup();

do $operation_recovery_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment('operation-context');
    v_other_payment_id bigint := provider_reconciliation_test.seed_payment('operation-context-other');
    v_transfer_operation_id bigint;
    v_reversal_operation_id bigint;
    v_refund_operation_id bigint;
    v_transfer_id bigint;
    v_recovery_id bigint;
    v_context record;
    v_expected jsonb;
begin
    v_transfer_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'operation-context-transfer', 'transfer_create'
    );
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        stripe_transfer_id, source_charge_id, destination_account_id,
        transfer_group, amount, currency, status, provider_snapshot
    ) values (
        v_payment_id, v_transfer_operation_id,
        'provider-reconciliation-pg-operation-context-release', 'initial',
        'tr_provider_reconciliation_operation_context',
        'ch_provider_reconciliation_operation_context',
        'acct_provider_reconciliation_operation_context',
        'provider_reconciliation_operation_context', 1080, 'eur', 'succeeded',
        '{"id":"tr_provider_reconciliation_operation_context"}'::jsonb
    ) returning id into v_transfer_id;

    insert into stripe_connect.transfer_recovery_requests (
        payment_id, recovery_request_id, exposure_type, requested_amount,
        allocated_amount, confirmed_amount, allocation_shortfall_amount,
        currency, reason, status
    ) values (
        v_payment_id, 'provider-reconciliation-pg-operation-context-recovery',
        'refund_recovery', 1080, 1080, 1080, 0, 'eur',
        'operation recovery context', 'succeeded'
    ) returning id into v_recovery_id;
    v_reversal_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'operation-context-reversal', 'transfer_reversal_create'
    );
    insert into stripe_connect.transfer_reversals (
        payment_id, recovery_id, allocation_index, transfer_id, operation_id,
        reversal_request_id, stripe_transfer_reversal_id,
        amount, currency, status, provider_snapshot
    ) values (
        v_payment_id, v_recovery_id, 1, v_transfer_id, v_reversal_operation_id,
        'provider-reconciliation-pg-operation-context-reversal',
        'trr_provider_reconciliation_operation_context',
        1080, 'eur', 'succeeded',
        '{"id":"trr_provider_reconciliation_operation_context"}'::jsonb
    );

    v_refund_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'operation-context-refund', 'refund_create'
    );
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_refund_id,
        stripe_charge_id, amount, seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, status, provider_snapshot
    ) values (
        v_payment_id, v_refund_operation_id,
        'provider-reconciliation-pg-operation-context-refund',
        're_provider_reconciliation_operation_context',
        'ch_provider_reconciliation_operation_context', 1200, 1080, 0,
        'eur', 'pending',
        '{"id":"re_provider_reconciliation_operation_context"}'::jsonb
    );

    select * into strict v_context
    from stripe_connect.read_financial_operation_recovery_context(
        v_payment_id, v_transfer_operation_id, null
    );
    select pg_catalog.to_jsonb(payment) into strict v_expected
    from stripe_connect.payments payment where id = v_payment_id;
    if v_context.payment <> v_expected
       or (v_context.transfer ->> 'id')::bigint <> v_transfer_id
       or v_context.transfer_reversal is not null
       or v_context.transfer_recovery is not null
       or v_context.refund is not null then
        raise exception 'provider reconciliation: transfer operation context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_financial_operation_recovery_context(
        v_payment_id, v_reversal_operation_id,
        'provider-reconciliation-pg-operation-context-recovery'
    );
    if (v_context.transfer_reversal ->> 'operation_id')::bigint
            <> v_reversal_operation_id
       or (v_context.transfer_recovery ->> 'id')::bigint <> v_recovery_id
       or v_context.transfer is not null or v_context.refund is not null then
        raise exception 'provider reconciliation: reversal operation context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_financial_operation_recovery_context(
        v_other_payment_id, v_refund_operation_id,
        'provider-reconciliation-pg-operation-context-recovery'
    );
    if (v_context.payment ->> 'id')::bigint <> v_other_payment_id
       or (v_context.refund ->> 'operation_id')::bigint <> v_refund_operation_id
       or (v_context.transfer_recovery ->> 'id')::bigint <> v_recovery_id then
        raise exception 'provider reconciliation: independent operation keys changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_financial_operation_recovery_context(
        -900000001, -900000001, 'provider-reconciliation-pg-missing-recovery'
    );
    if v_context.payment is not null or v_context.transfer is not null
       or v_context.transfer_reversal is not null
       or v_context.transfer_recovery is not null or v_context.refund is not null then
        raise exception 'provider reconciliation: missing operation context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$operation_recovery_context$;
