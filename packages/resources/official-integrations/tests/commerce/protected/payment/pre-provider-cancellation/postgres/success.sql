select commerce_pre_provider_test.seed_case('created-no-provider');

do $first_and_replay$
declare
    v_case commerce_pre_provider_test.cases%rowtype;
    v_first jsonb;
    v_replay jsonb;
    v_cancelled_at timestamptz;
begin
    select * into strict v_case
    from commerce_pre_provider_test.cases
    where label = 'created-no-provider';

    v_first := commerce.record_absent_order_payment_cancellation(
        v_case.public_id,
        'pre-provider:absent:created-no-provider',
        v_case.cancellation_key,
        v_case.occurred_at,
        '{"providerPaymentAbsent":true}'::jsonb
    );
    select cancelled_at into strict v_cancelled_at
    from commerce.order_payment_attempts
    where id = v_case.attempt_id;

    perform commerce_pre_provider_test.assert_true(
        v_first->>'idempotentReplay' = 'false'
        and exists (
            select 1 from commerce.orders
            where id = v_case.order_id and status = 'cancelled'
        )
        and exists (
            select 1 from commerce.payment_cancellation_requests
            where order_id = v_case.order_id and status = 'completed'
        )
        and exists (
            select 1 from commerce.order_fulfillments
            where order_id = v_case.order_id
              and status = 'cancelled'
              and blocking_reason = 'order_cancelled_before_payment'
        )
        and exists (
            select 1 from commerce.order_settlements
            where order_id = v_case.order_id
              and status = 'released'
              and authorized_seller_amount = 0
              and seller_reserve_liability_remaining_amount = 0
              and platform_gross_remainder_amount = 0
        )
        and exists (
            select 1 from commerce.order_payment_attempts
            where id = v_case.attempt_id
              and status = 'cancelled'
              and provider_payment_id is null
              and provider_payment_intent_id is null
              and provider_charge_id is null
              and cancelled_at = v_case.occurred_at
              and provider_snapshot @> jsonb_build_object(
                  'providerPaymentAbsent', true,
                  'cancelledBeforeProviderCreation', true,
                  'cancellationRequestId', v_case.cancellation_key
              )
        ),
        'created attempt without provider identity was not terminalized'
    );

    v_replay := commerce.record_absent_order_payment_cancellation(
        v_case.public_id,
        'pre-provider:absent:created-no-provider',
        v_case.cancellation_key,
        v_case.occurred_at,
        '{"providerPaymentAbsent":true}'::jsonb
    );
    perform commerce_pre_provider_test.assert_true(
        v_replay->>'idempotentReplay' = 'true'
        and (
            select cancelled_at = v_cancelled_at
            from commerce.order_payment_attempts
            where id = v_case.attempt_id
        )
        and (
            select count(*) = 1
            from commerce.audit_events
            where order_id = v_case.order_id
              and event_type = 'payment_attempt_cancelled_before_provider_creation'
        )
        and (
            select count(*) = 1
            from commerce.outbox_events
            where order_id = v_case.order_id
              and topic = 'commerce.order.payment_attempt_cancelled_before_provider_creation'
        ),
        'pre-provider cancellation replay duplicated or changed its audit tombstone'
    );
end;
$first_and_replay$;
