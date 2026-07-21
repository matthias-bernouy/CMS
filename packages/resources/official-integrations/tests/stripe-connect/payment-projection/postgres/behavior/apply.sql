begin;
set local role service_role;

do $apply_contract$
declare
    v_payment_id bigint;
    v_expected jsonb;
    v_payment jsonb;
    v_result jsonb;
    v_projection_key text;
begin
    v_payment_id := payment_projection_test.seed('behavior-apply');
    v_projection_key := 'payment:' || v_payment_id
        || ':provider-sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('b', 64);
    v_expected := payment_projection_test.snapshot(v_payment_id);
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:01:00+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or (select pg_catalog.count(*)
          from pg_catalog.jsonb_object_keys(v_result)) <> 2
       or v_payment->>'payment_status' <> 'succeeded'
       or v_payment->>'stripe_charge_id'
            <> 'ch_payment_projection_' || v_payment_id
       or v_payment->>'stripe_charge_balance_transaction_id'
            <> 'txn_payment_projection_' || v_payment_id
       or (v_payment->>'actual_stripe_charge_fee_amount')::bigint <> 65
       or (v_payment->>'actual_stripe_processing_fee_amount')::bigint <> 65
       or (v_payment->>'actual_stripe_charge_net_amount')::bigint <> 1135
       or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:01:00+00'::timestamptz
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
             and projection_key = v_projection_key
             and projection_kind = 'payment'
             and provider_object_id = v_payment_id::text) <> 1 then
        raise exception 'payment projection: successful apply diverged: %',
            v_result;
    end if;

    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_expected,
        payment_projection_test.apply_projection(
            v_payment_id,
            'payment:' || v_payment_id
                || ':provider-sync:succeeded:ch_payment_projection_'
                || v_payment_id || ':' || pg_catalog.repeat('c', 64),
            '2026-07-21 07:59:00+00'
        )
    );
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', false, 'payment', v_payment
    ) or payment_projection_test.snapshot(v_payment_id) is distinct from v_payment
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id) <> 1 then
        raise exception 'payment projection: stale apply wrote state: %',
            v_result;
    end if;

    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_payment,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:02:00+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:02:00+00'::timestamptz
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id) <> 1 then
        raise exception 'payment projection: fresh replay diverged: %',
            v_result;
    end if;
end;
$apply_contract$;

do $equivalent_stale_contract$
declare
    v_payment_id bigint;
    v_initial jsonb;
    v_before_business_change jsonb;
    v_payment jsonb;
    v_result jsonb;
    v_projection_key text;
begin
    v_payment_id := payment_projection_test.seed('equivalent-stale');
    v_projection_key := 'payment:' || v_payment_id
        || ':provider-sync:succeeded:ch_payment_projection_'
        || v_payment_id || ':' || pg_catalog.repeat('d', 64);
    v_initial := payment_projection_test.snapshot(v_payment_id);
    perform stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_initial,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:03:00+00'
        )
    );

    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_initial,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:04:00+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:04:00+00'::timestamptz
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id) <> 1 then
        raise exception 'payment projection: equivalent stale apply diverged: %',
            v_result;
    end if;

    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id, v_initial,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:02:00+00'
        )
    );
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', true, 'payment', v_payment
    ) or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:04:00+00'::timestamptz then
        raise exception 'payment projection: freshness regressed: %', v_result;
    end if;

    v_before_business_change := v_payment;
    update stripe_connect.payments
    set refunded_amount = 1
    where id = v_payment_id;
    v_payment := payment_projection_test.snapshot(v_payment_id);
    v_result := stripe_connect.apply_payment_provider_projection(
        v_payment_id,
        v_before_business_change,
        payment_projection_test.apply_projection(
            v_payment_id, v_projection_key, '2026-07-21 08:05:00+00'
        )
    );
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'applied', false, 'payment', v_payment
    ) or payment_projection_test.snapshot(v_payment_id) is distinct from v_payment
       or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:04:00+00'::timestamptz
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id) <> 1 then
        raise exception 'payment projection: business-stale apply diverged: %',
            v_result;
    end if;
end;
$equivalent_stale_contract$;

rollback;
