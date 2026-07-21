begin;
create function payment_projection_test.prepare_transient_review(p_case text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payment_id bigint := payment_projection_test.seed(p_case);
    v_intent_id text;
begin
    update stripe_connect.payments
    set payment_status = 'succeeded',
        settlement_status = 'manual_review',
        manual_review_reason =
            'Stripe payment provider truth mismatch: charge_balance_transaction_expansion',
        stripe_charge_id = 'ch_payment_projection_' || v_payment_id,
        stripe_charge_balance_transaction_id =
            'txn_payment_projection_' || v_payment_id
    where id = v_payment_id
    returning stripe_payment_intent_id into v_intent_id;
    insert into stripe_connect.provider_exceptions (
        deduplication_key, payment_id, exception_type,
        severity, status, message, details
    ) values (
        'provider-payment-truth:' || v_payment_id || ':' || v_intent_id,
        v_payment_id, 'provider_payment_truth_mismatch', 'critical', 'open',
        'Stripe payment provider truth mismatch: charge_balance_transaction_expansion',
        pg_catalog.jsonb_build_object(
            'paymentIntentId', v_intent_id,
            'chargeId', 'ch_payment_projection_' || v_payment_id,
            'mismatches', pg_catalog.jsonb_build_array(
                'charge_balance_transaction_expansion'
            )
        )
    );
    return v_payment_id;
end;
$$;
revoke all on function
    payment_projection_test.prepare_transient_review(text) from public;
grant execute on function
    payment_projection_test.prepare_transient_review(text) to service_role;
set local role service_role;
do $recovery_contract$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_payment jsonb;
    v_projection jsonb;
    v_result jsonb;
    v_normal_key text;
    v_recovered_key text;
    v_exception_key text;
    v_reason constant text :=
        'Stripe payment provider truth mismatch: charge_balance_transaction_expansion';
begin
    v_payment_id := payment_projection_test.prepare_transient_review(
        'recovery-success'
    );
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_exception_key := 'provider-payment-truth:' || v_payment_id || ':'
        || (v_expected->>'stripe_payment_intent_id');
    v_normal_key := 'payment:' || v_payment_id
        || ':provider:sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('a', 64);
    v_recovered_key := 'payment:' || v_payment_id
        || ':provider:sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('b', 64);
    v_projection := payment_projection_test.apply_projection(
        v_payment_id, v_normal_key, '2026-07-21 08:07:00+00'
    ) || pg_catalog.jsonb_build_object(
        'recoveredProjectionKey', v_recovered_key,
        'recovery', pg_catalog.jsonb_build_object(
            'exceptionKey', v_exception_key,
            'paymentIntentId', v_expected->>'stripe_payment_intent_id',
            'chargeId', v_expected->>'stripe_charge_id',
            'balanceTransactionId',
                v_expected->>'stripe_charge_balance_transaction_id',
            'actorKind', 'reconciliation',
            'actorId', 'provider:sync'
        )
    );
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id, v_expected, v_projection
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or v_payment->>'settlement_status' <> 'held'
       or v_payment->'manual_review_reason' <> 'null'::jsonb
       or (select pg_catalog.count(*)
           from stripe_connect.provider_exceptions
           where deduplication_key = v_exception_key
             and status = 'resolved' and resolved_at is not null
             and resolved_by = 'provider-truth-revalidation') <> 1
       or (select pg_catalog.count(*)
           from stripe_connect.payment_events
           where payment_id = v_payment_id
             and event_type = 'provider_payment_truth_revalidated'
             and actor_kind = 'reconciliation'
             and actor_id = 'provider:sync') <> 1
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
             and projection_key = v_recovered_key) <> 1
       or exists (
           select 1 from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
             and projection_key = v_normal_key
       ) then
        raise exception 'payment projection: recovery success diverged: %',
            v_result;
    end if;
    v_payment_id := payment_projection_test.prepare_transient_review(
        'recovery-refused'
    );
    insert into stripe_connect.provider_exceptions (
        deduplication_key, payment_id, exception_type, severity,
        status, message, details
    ) values (
        'payment-projection-other:' || v_payment_id, v_payment_id,
        'unrelated_provider_review', 'high', 'open',
        'Unrelated provider review', '{}'::jsonb
    );
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_exception_key := 'provider-payment-truth:' || v_payment_id || ':'
        || (v_expected->>'stripe_payment_intent_id');
    v_normal_key := 'payment:' || v_payment_id
        || ':provider-sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('c', 64);
    v_recovered_key := 'payment:' || v_payment_id
        || ':provider-sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('d', 64);
    v_projection := payment_projection_test.apply_projection(
        v_payment_id, v_normal_key, '2026-07-21 08:08:00+00'
    ) || pg_catalog.jsonb_build_object(
        'recoveredProjectionKey', v_recovered_key,
        'recovery', pg_catalog.jsonb_build_object(
            'exceptionKey', v_exception_key,
            'paymentIntentId', v_expected->>'stripe_payment_intent_id',
            'chargeId', v_expected->>'stripe_charge_id',
            'balanceTransactionId',
                v_expected->>'stripe_charge_balance_transaction_id',
            'actorKind', 'reconciliation', 'actorId', 'provider-sync'
        )
    );
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id, v_expected, v_projection
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or v_payment->>'settlement_status' <> 'manual_review'
       or v_payment->>'manual_review_reason' <> v_reason
       or (select pg_catalog.count(*)
           from stripe_connect.provider_exceptions
           where payment_id = v_payment_id and status = 'open') <> 2
       or exists (
           select 1 from stripe_connect.payment_events
           where payment_id = v_payment_id
             and event_type = 'provider_payment_truth_revalidated'
       ) or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
             and projection_key = v_normal_key) <> 1
       or exists (
           select 1 from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
             and projection_key = v_recovered_key
       ) then
        raise exception 'payment projection: recovery refusal diverged: %',
            v_result;
    end if;
end;
$recovery_contract$;
rollback;
