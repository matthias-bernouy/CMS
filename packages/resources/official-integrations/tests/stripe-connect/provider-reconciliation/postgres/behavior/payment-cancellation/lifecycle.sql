select provider_reconciliation_test.cleanup();

do $cancellation_intent$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'cancellation-intent-linked'
    );
    v_first jsonb;
    v_replay jsonb;
    v_guard stripe_connect.payment_lifecycle_guards%rowtype;
begin
    v_first := stripe_connect.reserve_payment_cancellation_intent(
        ' provider-reconciliation-pg-cancellation-intent-linked ',
        ' cancellation-intent-linked ',
        ' buyer cancelled '
    );
    if v_first - 'requestedAt' is distinct from pg_catalog.jsonb_build_object(
        'clientReferenceId', 'provider-reconciliation-pg-cancellation-intent-linked',
        'cancellationRequestId', 'cancellation-intent-linked',
        'paymentId', v_payment_id,
        'providerPaymentAbsent', false
    ) or nullif(v_first->>'requestedAt', '') is null then
        raise exception 'provider reconciliation: linked cancellation intent changed: %',
            v_first;
    end if;

    select * into strict v_guard
    from stripe_connect.payment_lifecycle_guards
    where client_reference_id =
        'provider-reconciliation-pg-cancellation-intent-linked';
    if v_guard.payment_id <> v_payment_id
       or v_guard.cancellation_request_id <> 'cancellation-intent-linked'
       or v_guard.cancellation_reason <> 'buyer cancelled'
       or v_guard.cancellation_requested_at is null
       or v_guard.payment_linked_at is null then
        raise exception 'provider reconciliation: linked cancellation guard changed: %',
            pg_catalog.to_jsonb(v_guard);
    end if;

    v_replay := stripe_connect.reserve_payment_cancellation_intent(
        'provider-reconciliation-pg-cancellation-intent-linked',
        'cancellation-intent-linked',
        'buyer cancelled'
    );
    if v_replay is distinct from v_first then
        raise exception 'provider reconciliation: cancellation intent replay changed: %',
            v_replay;
    end if;

    begin
        perform stripe_connect.reserve_payment_cancellation_intent(
            'provider-reconciliation-pg-cancellation-intent-linked',
            'cancellation-intent-other',
            'buyer cancelled'
        );
        raise exception 'provider reconciliation: expected cancellation intent mismatch';
    exception when others then
        if sqlerrm <> 'conflict: payment cancellation intent replay mismatch' then
            raise;
        end if;
    end;
end;
$cancellation_intent$;

do $absent_cancellation_intent$
declare
    v_first jsonb;
    v_replay jsonb;
begin
    v_first := stripe_connect.reserve_payment_cancellation_intent(
        'provider-reconciliation-pg-cancellation-intent-absent',
        'cancellation-intent-absent',
        null
    );
    if v_first - 'requestedAt' is distinct from pg_catalog.jsonb_build_object(
        'clientReferenceId', 'provider-reconciliation-pg-cancellation-intent-absent',
        'cancellationRequestId', 'cancellation-intent-absent',
        'paymentId', null,
        'providerPaymentAbsent', true
    ) or nullif(v_first->>'requestedAt', '') is null then
        raise exception 'provider reconciliation: absent cancellation intent changed: %',
            v_first;
    end if;
    v_replay := stripe_connect.reserve_payment_cancellation_intent(
        'provider-reconciliation-pg-cancellation-intent-absent',
        'cancellation-intent-absent',
        '   '
    );
    if v_replay is distinct from v_first then
        raise exception 'provider reconciliation: absent cancellation replay changed: %',
            v_replay;
    end if;
end;
$absent_cancellation_intent$;

select provider_reconciliation_test.cleanup();
