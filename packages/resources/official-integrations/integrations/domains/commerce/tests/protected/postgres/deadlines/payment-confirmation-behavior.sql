-- Deadline arming, replay, expiry, and carrier-recovery behavior.
do $prepayment_is_inert$
declare
    v_order_id bigint := (
        select id from commerce.orders
        where order_number = 'DEADLINE-PAYMENT-CONFIRMATION'
    );
    v_worker_result jsonb;
begin
    update commerce.order_fulfillments set
        seller_handoff_deadline = clock_timestamp() - interval '2 hours',
        scan_grace_deadline = clock_timestamp() - interval '1 hour'
    where order_id = v_order_id;

    v_worker_result := commerce.process_due_order_deadlines(
        'protected-deadline-prepayment',
        10
    );
    if (v_worker_result->>'processed')::integer <> 0
        or exists (
            select 1
            from commerce.order_fulfillments
            where order_id = v_order_id
              and (
                  payment_confirmed_at is not null
                  or blocking_reason is not null
                  or status <> 'awaiting_shipment'
              )
        )
    then
        raise exception 'protected deadlines: pre-payment placeholders were enforced';
    end if;
end;
$prepayment_is_inert$;

do $payment_arms_deadlines$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_before timestamptz := clock_timestamp();
    v_after timestamptz;
    v_first jsonb;
    v_replay jsonb;
    v_distinct_success jsonb;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_first_version integer;
    v_first_confirmation timestamptz;
    v_first_handoff timestamptz;
    v_first_scan_grace timestamptz;
    v_provider_occurred_at timestamptz := clock_timestamp() - interval '6 hours';
begin
    select * into strict v_order
    from commerce.orders
    where order_number = 'DEADLINE-PAYMENT-CONFIRMATION';
    select * into strict v_terms
    from commerce.order_financial_terms
    where order_id = v_order.id;

    v_first := commerce.record_order_payment_projection(
        v_order.public_id,
        'deadline-payment-success',
        88001,
        'succeeded',
        v_terms.buyer_total_amount,
        'eur',
        v_terms.financial_terms_hash,
        v_provider_occurred_at,
        '{}'::jsonb,
        'ch_deadline_payment',
        'pi_deadline_payment'
    );
    v_after := clock_timestamp();

    select * into strict v_fulfillment
    from commerce.order_fulfillments
    where order_id = v_order.id;

    if v_first->>'idempotentReplay' <> 'false'
        or v_fulfillment.payment_confirmed_at < v_before
        or v_fulfillment.payment_confirmed_at > v_after
        or v_fulfillment.seller_handoff_deadline
            <> v_fulfillment.payment_confirmed_at + interval '72 hours'
        or v_fulfillment.scan_grace_deadline
            <> v_fulfillment.seller_handoff_deadline + interval '48 hours'
        or not exists (
            select 1 from commerce.orders
            where id = v_order.id and status = 'active'
        )
    then
        raise exception 'protected deadlines: payment did not arm exact policy windows';
    end if;

    v_first_version := v_fulfillment.version;
    v_first_confirmation := v_fulfillment.payment_confirmed_at;
    v_first_handoff := v_fulfillment.seller_handoff_deadline;
    v_first_scan_grace := v_fulfillment.scan_grace_deadline;

    v_replay := commerce.record_order_payment_projection(
        v_order.public_id,
        'deadline-payment-success',
        88001,
        'succeeded',
        v_terms.buyer_total_amount,
        'eur',
        v_terms.financial_terms_hash,
        v_provider_occurred_at,
        '{}'::jsonb,
        'ch_deadline_payment',
        'pi_deadline_payment'
    );
    v_distinct_success := commerce.record_order_payment_projection(
        v_order.public_id,
        'deadline-payment-success-distinct',
        88001,
        'succeeded',
        v_terms.buyer_total_amount,
        'eur',
        v_terms.financial_terms_hash,
        clock_timestamp(),
        '{}'::jsonb,
        'ch_deadline_payment',
        'pi_deadline_payment'
    );

    select * into strict v_fulfillment
    from commerce.order_fulfillments
    where order_id = v_order.id;
    if v_replay->>'idempotentReplay' <> 'true'
        or v_distinct_success->>'idempotentReplay' <> 'false'
        or v_fulfillment.version <> v_first_version
        or v_fulfillment.payment_confirmed_at <> v_first_confirmation
        or v_fulfillment.seller_handoff_deadline <> v_first_handoff
        or v_fulfillment.scan_grace_deadline <> v_first_scan_grace
    then
        raise exception 'protected deadlines: payment replay moved an armed deadline';
    end if;
end;
$payment_arms_deadlines$;

rollback;
