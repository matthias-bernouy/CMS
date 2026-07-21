begin;
set local role service_role;

do $freshness_contract$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_payment jsonb;
    v_result jsonb;
    v_projection_key text;
begin
    v_payment_id := payment_projection_test.seed('freshness-apply');
    v_projection_key := 'payment:' || v_payment_id
        || ':provider-sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('e', 64);
    v_expected := payment_projection_test.snapshot(v_payment_id);
    perform stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:10:00+00'
        )
    );
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:00:00+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:10:00+00'::timestamptz then
        raise exception 'payment projection: apply freshness regressed: %',
            v_result;
    end if;

    v_payment_id := payment_projection_test.seed('freshness-quarantine');
    v_projection_key := 'payment:' || v_payment_id
        || ':provider-sync:quarantine:' || pg_catalog.repeat('f', 64);
    v_expected := payment_projection_test.snapshot(v_payment_id);
    perform stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.quarantine_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:10:00+00'
        )
    );
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.quarantine_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:00:00+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:10:00+00'::timestamptz
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id) <> 1
       or (select pg_catalog.count(*)
           from stripe_connect.payment_events
           where payment_id = v_payment_id
             and event_type = 'provider_payment_truth_mismatch') <> 2 then
        raise exception 'payment projection: quarantine freshness regressed: %',
            v_result;
    end if;
end;
$freshness_contract$;

rollback;
