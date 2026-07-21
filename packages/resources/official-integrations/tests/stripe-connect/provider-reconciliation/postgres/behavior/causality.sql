select provider_reconciliation_test.cleanup();

do $causality$
declare
    v_payment_id bigint;
    v_reversal_operation_id bigint;
    v_refund_operation_id bigint;
    v_first text[];
    v_second text[];
begin
    v_payment_id := provider_reconciliation_test.seed_payment('causality');
    v_reversal_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'causality-reversal', 'transfer_reversal_create'
    );
    v_refund_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'causality-refund', 'refund_create'
    );
    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind,
        recovery_key, causal_sequence, created_at
    ) values
        (v_refund_operation_id, v_payment_id,
            'provider-reconciliation-pg-causality-refund', 'refund',
            'provider-reconciliation-pg-recovery', 1, '2026-07-21 08:00:00+00'),
        (v_reversal_operation_id, v_payment_id,
            'provider-reconciliation-pg-causality-reversal', 'reversal',
            'provider-reconciliation-pg-recovery', 0, '2026-07-21 08:01:00+00');

    select pg_catalog.array_agg(projection_key)
    into v_first
    from stripe_connect.claim_commerce_projection_outbox('causality-first', 10);
    if v_first <> array['provider-reconciliation-pg-causality-reversal'] then
        raise exception 'provider reconciliation: refund bypassed reversal: %', v_first;
    end if;

    update stripe_connect.commerce_projection_outbox
    set projection_status = 'succeeded', claim_owner = null,
        claim_token = null, claimed_at = null, projected_at = now()
    where projection_key = 'provider-reconciliation-pg-causality-reversal';

    select pg_catalog.array_agg(projection_key)
    into v_second
    from stripe_connect.claim_commerce_projection_outbox('causality-second', 10);
    if v_second <> array['provider-reconciliation-pg-causality-refund'] then
        raise exception 'provider reconciliation: refund did not follow reversal: %', v_second;
    end if;
end;
$causality$;

select provider_reconciliation_test.cleanup();
