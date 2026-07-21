-- Payment reconciliation local read-context contract.
select provider_reconciliation_test.cleanup();

do $payment_local_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment('payment-local');
    v_empty_payment_id bigint := provider_reconciliation_test.seed_payment('payment-local-empty');
    v_other_payment_id bigint := provider_reconciliation_test.seed_payment('payment-local-other');
    v_operation_id bigint;
    v_first_refund_id bigint;
    v_second_refund_id bigint;
    v_context record;
    v_expected_payment jsonb;
    v_expected_refunds jsonb;
    v_row_count bigint;
begin
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'payment-local-refund-first', 'refund_create'
    );
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_refund_id,
        stripe_charge_id, amount, required_reversal_amount,
        seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, reason, status,
        provider_snapshot
    ) values (
        v_payment_id, v_operation_id,
        'provider-reconciliation-pg-payment-local-refund-first',
        're_provider_reconciliation_payment_local_first',
        'ch_provider_reconciliation_payment_local', 120, 40, 40, 1040,
        'eur', 'first local refund', 'pending',
        '{"id":"re_provider_reconciliation_payment_local_first","status":"pending"}'::jsonb
    ) returning id into v_first_refund_id;

    v_operation_id := provider_reconciliation_test.seed_operation(
        v_other_payment_id, 'payment-local-other-refund', 'refund_create'
    );
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_refund_id,
        stripe_charge_id, amount, seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, status
    ) values (
        v_other_payment_id, v_operation_id,
        'provider-reconciliation-pg-payment-local-other-refund',
        're_provider_reconciliation_payment_local_other',
        'ch_provider_reconciliation_payment_local_other', 999, 999, 81,
        'eur', 'succeeded'
    );

    v_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'payment-local-refund-second', 'refund_create'
    );
    insert into stripe_connect.refunds (
        payment_id, operation_id, refund_request_id, stripe_refund_id,
        stripe_charge_id, amount, required_reversal_amount,
        seller_entitlement_reduction_amount,
        authorized_seller_amount_after_refund, currency, reason, status,
        provider_snapshot
    ) values (
        v_payment_id, v_operation_id,
        'provider-reconciliation-pg-payment-local-refund-second',
        're_provider_reconciliation_payment_local_second',
        'ch_provider_reconciliation_payment_local', 80, 20, 20, 1020,
        'eur', 'second local refund', 'processing',
        '{"id":"re_provider_reconciliation_payment_local_second","status":"processing"}'::jsonb
    ) returning id into v_second_refund_id;

    select pg_catalog.to_jsonb(payment) into strict v_expected_payment
    from stripe_connect.payments payment
    where payment.id = v_payment_id;
    select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(refund) order by refund.id),
        '[]'::jsonb
    ) into strict v_expected_refunds
    from stripe_connect.refunds refund
    where refund.payment_id = v_payment_id;

    select pg_catalog.count(*) into v_row_count
    from stripe_connect.read_payment_reconciliation_local_context(v_payment_id);
    if v_row_count <> 1 then
        raise exception 'provider reconciliation: payment local context cardinality changed: %',
            v_row_count;
    end if;
    select * into strict v_context
    from stripe_connect.read_payment_reconciliation_local_context(v_payment_id);
    if v_context.payment <> v_expected_payment
       or v_context.refunds <> v_expected_refunds
       or pg_catalog.jsonb_array_length(v_context.refunds) <> 2
       or (v_context.refunds -> 0 ->> 'id')::bigint <> v_first_refund_id
       or (v_context.refunds -> 1 ->> 'id')::bigint <> v_second_refund_id then
        raise exception 'provider reconciliation: payment local context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select pg_catalog.count(*) into v_row_count
    from stripe_connect.read_payment_reconciliation_local_context(v_empty_payment_id);
    if v_row_count <> 1 then
        raise exception 'provider reconciliation: empty payment local context cardinality changed: %',
            v_row_count;
    end if;
    select * into strict v_context
    from stripe_connect.read_payment_reconciliation_local_context(v_empty_payment_id);
    select pg_catalog.to_jsonb(payment) into strict v_expected_payment
    from stripe_connect.payments payment
    where payment.id = v_empty_payment_id;
    if v_context.payment <> v_expected_payment or v_context.refunds <> '[]'::jsonb then
        raise exception 'provider reconciliation: empty payment local context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select pg_catalog.count(*) into v_row_count
    from stripe_connect.read_payment_reconciliation_local_context(-900000001);
    if v_row_count <> 1 then
        raise exception 'provider reconciliation: missing payment local context cardinality changed: %',
            v_row_count;
    end if;
    select * into strict v_context
    from stripe_connect.read_payment_reconciliation_local_context(-900000001);
    if v_context.payment is not null or v_context.refunds <> '[]'::jsonb then
        raise exception 'provider reconciliation: missing payment local context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$payment_local_context$;

select provider_reconciliation_test.cleanup();
