select commerce_pre_provider_test.seed_case(
    'provider-payment-id', 'created', 701
);
select commerce_pre_provider_test.seed_case(
    'provider-intent', 'created', null, 'pi_provider_possible'
);
select commerce_pre_provider_test.seed_case(
    'provider-charge', 'created', null, null, 'ch_provider_possible'
);
select commerce_pre_provider_test.seed_case(
    'provider-status', 'requires_action'
);
select commerce_pre_provider_test.seed_case(
    'multiple-attempts'
);
insert into commerce.order_payment_attempts (
    order_id, provider, client_reference_id, status,
    amount, currency, financial_terms_hash
)
select
    test_case.order_id, 'stripe-alternate', test_case.public_id::text,
    'created', 100, 'eur', repeat('a', 64)
from commerce_pre_provider_test.cases test_case
where test_case.label = 'multiple-attempts';

do $provider_possible$
declare
    v_case commerce_pre_provider_test.cases%rowtype;
    v_label text;
begin
    foreach v_label in array array[
        'provider-payment-id',
        'provider-intent',
        'provider-charge',
        'provider-status',
        'multiple-attempts'
    ]
    loop
        select * into strict v_case
        from commerce_pre_provider_test.cases
        where label = v_label;
        begin
            perform commerce.record_absent_order_payment_cancellation(
                v_case.public_id,
                'pre-provider:absent:' || v_label,
                v_case.cancellation_key,
                v_case.occurred_at,
                '{"providerPaymentAbsent":true}'::jsonb
            );
            raise exception 'test: provider-possible attempt passed';
        exception when others then
            if sqlerrm = 'test: provider-possible attempt passed'
                or sqlerrm <>
                    'conflict: absent provider truth cannot finalize an order with a payment attempt'
            then
                raise;
            end if;
        end;
        perform commerce_pre_provider_test.assert_true(
            exists (
                select 1 from commerce.orders
                where id = v_case.order_id and status = 'cancellation_pending'
            )
            and exists (
                select 1 from commerce.payment_cancellation_requests
                where order_id = v_case.order_id and status = 'requested'
            )
            and not exists (
                select 1 from commerce.audit_events
                where order_id = v_case.order_id
                  and event_type = 'payment_attempt_cancelled_before_provider_creation'
            )
            and not exists (
                select 1 from commerce.order_payment_attempts
                where order_id = v_case.order_id and status = 'cancelled'
            )
            and not exists (
                select 1 from commerce.provider_projection_events
                where order_id = v_case.order_id
                  and event_type = 'payment.absent'
            ),
            'provider-possible attempt was mutated before rejection: ' || v_label
        );
    end loop;
end;
$provider_possible$;
