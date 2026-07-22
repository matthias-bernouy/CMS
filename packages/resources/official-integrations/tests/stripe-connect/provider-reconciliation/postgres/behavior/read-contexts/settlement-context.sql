-- Settlement-release pre-provider read-context contract.
select provider_reconciliation_test.cleanup();

do $settlement_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'settlement-context'
    );
    v_other_payment_id bigint := provider_reconciliation_test.seed_payment(
        'settlement-context-other'
    );
    v_operation_id bigint;
    v_transfer_id bigint;
    v_other_transfer_id bigint;
    v_context record;
    v_expected_account jsonb;
    v_expected_transfer jsonb;
    v_index integer;
    v_refund_statuses text[] := array[
        'succeeded', 'succeeded', 'reserved', 'processing',
        'pending', 'failed', 'cancelled', 'manual_review'
    ];
begin
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'settlement-context-transfer', 'transfer_create'
    );
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        source_charge_id, destination_account_id, transfer_group,
        amount, currency, status
    ) values (
        v_payment_id, v_operation_id,
        'provider-reconciliation-pg-settlement-context-release',
        'initial', 'ch_provider_reconciliation_settlement_context',
        'acct_provider_reconciliation_settlement-context',
        'provider_reconciliation_settlement_context',
        400, 'eur', 'processing'
    ) returning id into v_transfer_id;

    for v_index in 1..pg_catalog.array_length(v_refund_statuses, 1) loop
        v_operation_id := provider_reconciliation_test.seed_operation(
            v_payment_id,
            'settlement-context-refund-' || v_index,
            'refund_create'
        );
        insert into stripe_connect.refunds (
            payment_id, operation_id, refund_request_id, stripe_charge_id,
            amount, seller_entitlement_reduction_amount,
            authorized_seller_amount_after_refund, currency, status
        ) values (
            v_payment_id, v_operation_id,
            'provider-reconciliation-pg-settlement-context-refund-' || v_index,
            'ch_provider_reconciliation_settlement_context',
            100, case v_index when 1 then 70 when 2 then 50 else 1000 end,
            900, 'eur', v_refund_statuses[v_index]
        );
    end loop;

    v_operation_id := provider_reconciliation_test.seed_operation(
        v_other_payment_id,
        'settlement-context-other-transfer',
        'transfer_create'
    );
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        source_charge_id, destination_account_id, transfer_group,
        amount, currency, status
    ) values (
        v_other_payment_id, v_operation_id,
        'provider-reconciliation-pg-settlement-context-other-release',
        'initial', 'ch_provider_reconciliation_settlement_context_other',
        'acct_provider_reconciliation_settlement-context-other',
        'provider_reconciliation_settlement_context_other',
        999, 'eur', 'manual_review'
    ) returning id into v_other_transfer_id;

    select pg_catalog.to_jsonb(account) into strict v_expected_account
    from stripe_connect.accounts account
    where account.cms_user_id =
        'provider-reconciliation-pg-seller-settlement-context';
    select pg_catalog.to_jsonb(transfer) into strict v_expected_transfer
    from stripe_connect.transfers transfer
    where transfer.id = v_transfer_id;
    select * into strict v_context
    from stripe_connect.read_settlement_release_context(
        v_payment_id,
        'provider-reconciliation-pg-seller-settlement-context',
        'provider-reconciliation-pg-settlement-context-release'
    );
    if v_context.seller_account <> v_expected_account
       or v_context.existing_transfer <> v_expected_transfer
       or v_context.seller_recovery_amount <> 120 then
        raise exception 'provider reconciliation: settlement context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_settlement_release_context(
        v_payment_id,
        'provider-reconciliation-pg-seller-settlement-context',
        'provider-reconciliation-pg-settlement-context-other-release'
    );
    if (v_context.existing_transfer ->> 'id')::bigint <> v_other_transfer_id
       or (v_context.existing_transfer ->> 'payment_id')::bigint
            <> v_other_payment_id then
        raise exception 'provider reconciliation: settlement authorization lookup changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_settlement_release_context(
        -900000001,
        'provider-reconciliation-pg-missing-seller',
        'provider-reconciliation-pg-missing-authorization'
    );
    if v_context.seller_account is not null
       or v_context.existing_transfer is not null
       or v_context.seller_recovery_amount <> 0 then
        raise exception 'provider reconciliation: missing settlement context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$settlement_context$;

select provider_reconciliation_test.cleanup();
