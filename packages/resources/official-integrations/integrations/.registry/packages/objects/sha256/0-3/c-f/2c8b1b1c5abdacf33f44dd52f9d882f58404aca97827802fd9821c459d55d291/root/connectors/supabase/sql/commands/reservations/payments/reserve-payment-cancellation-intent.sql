

create or replace function stripe_connect.reserve_payment_cancellation_intent(
    p_client_reference_id text,
    p_cancellation_request_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_reference text := nullif(btrim(p_client_reference_id), '');
    v_cancellation_id text := nullif(btrim(p_cancellation_request_id), '');
    v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Commerce requested provider payment cancellation');
    v_guard stripe_connect.payment_lifecycle_guards%rowtype;
    v_payment stripe_connect.payments%rowtype;
begin
    if v_reference is null or v_cancellation_id is null then
        raise exception 'validation: client reference and cancellation request ids are required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe-connect:payment-lifecycle:' || v_reference, 0)
    );
    select * into v_payment
    from stripe_connect.payments
    where client_reference_id = v_reference
    for update;
    insert into stripe_connect.payment_lifecycle_guards (
        client_reference_id, payment_id, payment_linked_at
    ) values (
        v_reference, v_payment.id, case when v_payment.id is not null then now() end
    ) on conflict (client_reference_id) do update set
        payment_id = coalesce(stripe_connect.payment_lifecycle_guards.payment_id, excluded.payment_id),
        payment_linked_at = coalesce(stripe_connect.payment_lifecycle_guards.payment_linked_at, excluded.payment_linked_at)
    returning * into v_guard;
    if v_guard.cancellation_request_id is not null
        and (v_guard.cancellation_request_id <> v_cancellation_id
            or v_guard.cancellation_reason <> v_reason) then
        raise exception 'conflict: payment cancellation intent replay mismatch';
    end if;
    if v_guard.cancellation_request_id is null then
        update stripe_connect.payment_lifecycle_guards
        set cancellation_request_id = v_cancellation_id,
            cancellation_reason = v_reason,
            cancellation_requested_at = now()
        where client_reference_id = v_reference
        returning * into v_guard;
    end if;
    return jsonb_build_object(
        'clientReferenceId', v_reference,
        'cancellationRequestId', v_guard.cancellation_request_id,
        'paymentId', v_guard.payment_id,
        'providerPaymentAbsent', v_guard.payment_id is null,
        'requestedAt', v_guard.cancellation_requested_at
    );
end;
$$;