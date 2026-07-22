-- Transfer Reversal completion keeps the succeeded-only aggregate before payment.
select provider_reconciliation_test.cleanup();

do $transfer_reversal_completion_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'transfer-reversal-completion-context'
    );
    v_transfer_operation_id bigint := provider_reconciliation_test.seed_operation(
        v_payment_id, 'transfer-reversal-completion-context-transfer', 'transfer_create'
    );
    v_transfer_id bigint;
    v_operation_id bigint;
    v_context record;
    v_expected_payment jsonb;
    v_index integer;
    v_statuses text[] := array[
        'succeeded', 'succeeded', 'reserved',
        'processing', 'failed', 'manual_review'
    ];
begin
    insert into stripe_connect.transfers (
        payment_id, operation_id, release_authorization_id, release_kind,
        source_charge_id, destination_account_id, transfer_group,
        amount, currency, status
    ) values (
        v_payment_id, v_transfer_operation_id,
        'provider-reconciliation-pg-transfer-reversal-completion-context-release',
        'initial', 'ch_provider_reconciliation_completion_context',
        'acct_provider_reconciliation_transfer-reversal-completion-context',
        'provider_reconciliation_transfer_reversal_completion_context',
        5000, 'eur', 'succeeded'
    ) returning id into v_transfer_id;

    for v_index in 1..pg_catalog.array_length(v_statuses, 1) loop
        v_operation_id := provider_reconciliation_test.seed_operation(
            v_payment_id,
            'transfer-reversal-completion-context-' || v_index,
            'transfer_reversal_create'
        );
        insert into stripe_connect.transfer_reversals (
            payment_id, transfer_id, operation_id, reversal_request_id,
            amount, currency, status
        ) values (
            v_payment_id, v_transfer_id, v_operation_id,
            'provider-reconciliation-pg-transfer-reversal-completion-context-' || v_index,
            case v_index when 1 then 100 when 2 then 200 else 1000 end,
            'eur', v_statuses[v_index]
        );
    end loop;

    select pg_catalog.to_jsonb(payment) into strict v_expected_payment
    from stripe_connect.payments payment where payment.id = v_payment_id;
    select * into strict v_context
    from stripe_connect.read_transfer_reversal_completion_context(v_payment_id);
    if v_context.reversed_amount <> 300
       or v_context.payment <> v_expected_payment then
        raise exception 'provider reconciliation: reversal completion context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_transfer_reversal_completion_context(-900000001);
    if v_context.reversed_amount <> 0 or v_context.payment is not null then
        raise exception 'provider reconciliation: missing reversal completion changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$transfer_reversal_completion_context$;

select provider_reconciliation_test.cleanup();
