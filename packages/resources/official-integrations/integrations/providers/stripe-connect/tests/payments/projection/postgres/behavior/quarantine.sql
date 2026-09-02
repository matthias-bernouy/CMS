begin;
set local role service_role;

do $quarantine_contract$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_payment jsonb;
    v_result jsonb;
    v_projection_key text;
    v_reason constant text :=
        'Stripe payment provider truth mismatch: payment_intent_amount';
begin
    v_payment_id := payment_projection_test.seed('behavior-quarantine');
    v_projection_key := 'payment:' || v_payment_id
        || ':provider-sync:quarantine:' || pg_catalog.repeat('d', 64);
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.quarantine_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:03:00+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or v_payment->>'payment_status' <> 'failed'
       or v_payment->>'settlement_status' <> 'manual_review'
       or v_payment->>'manual_review_reason' <> v_reason
       or v_payment->'paid_at' <> 'null'::jsonb
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
             and projection_key = v_projection_key) <> 1
       or (select pg_catalog.count(*)
           from stripe_connect.provider_exceptions
           where payment_id = v_payment_id
             and deduplication_key = 'provider-payment-truth:'
                || v_payment_id || ':pi_payment_projection_behavior-quarantine'
             and exception_type = 'provider_payment_truth_mismatch'
             and severity = 'critical'
             and status = 'open'
             and message = v_reason
             and details->'mismatches'
                = '["payment_intent_amount"]'::jsonb) <> 1
       or (select pg_catalog.count(*)
           from stripe_connect.payment_events
           where payment_id = v_payment_id
             and event_type = 'provider_payment_truth_mismatch'
             and actor_kind = 'reconciliation'
             and actor_id = 'provider-sync'
             and data->'mismatches'
                = '["payment_intent_amount"]'::jsonb) <> 1 then
        raise exception 'payment projection: quarantine diverged: %',
            v_result;
    end if;
end;
$quarantine_contract$;

rollback;
