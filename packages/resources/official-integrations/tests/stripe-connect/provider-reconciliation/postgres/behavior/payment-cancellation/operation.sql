select provider_reconciliation_test.cleanup();

do $required_rpc$
begin
    if pg_catalog.to_regprocedure(
        'stripe_connect.reserve_payment_cancellation_operation(bigint,text,text,jsonb)'
    ) is null then
        raise exception 'provider reconciliation: missing future cancellation operation RPC';
    end if;
end;
$required_rpc$;

create function provider_reconciliation_test.expect_cancellation_operation_error(
    p_payment_id bigint,
    p_client_reference_id text,
    p_business_key text,
    p_request jsonb,
    p_expected_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform * from stripe_connect.reserve_payment_cancellation_operation(
        p_payment_id, p_client_reference_id, p_business_key, p_request
    );
    raise exception 'provider reconciliation: expected cancellation operation error';
exception when others then
    if sqlerrm <> p_expected_error then
        raise;
    end if;
end;
$$;

do $cancellation_operation$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'cancellation-operation'
    );
    v_other_payment_id bigint := provider_reconciliation_test.seed_payment(
        'cancellation-operation-other'
    );
    v_reference text := 'provider-reconciliation-pg-cancellation-operation';
    v_key text := 'provider-reconciliation-pg-cancellation-operation';
    v_request jsonb := pg_catalog.jsonb_build_object(
        'clientReferenceId', v_reference,
        'cancellationRequestId', 'cancellation-operation-request',
        'reason', 'buyer cancelled'
    );
    v_payment jsonb;
    v_operation jsonb;
    v_expected_payment jsonb;
    v_expected_operation jsonb;
begin
    select pg_catalog.to_jsonb(payment) into strict v_expected_payment
    from stripe_connect.payments payment where payment.id = v_payment_id;
    select result.payment, result.operation
    into strict v_payment, v_operation
    from stripe_connect.reserve_payment_cancellation_operation(
        v_payment_id, v_reference, v_key, v_request
    ) result;
    select pg_catalog.to_jsonb(operation) into strict v_expected_operation
    from stripe_connect.financial_operations operation
    where operation.business_key = v_key;
    if v_payment is distinct from v_expected_payment
       or v_operation is distinct from v_expected_operation
       or v_operation->>'operation_type' <> 'payment_intent_cancel'
       or (v_operation->>'payment_id')::bigint <> v_payment_id
       or v_operation->'request' is distinct from v_request then
        raise exception 'provider reconciliation: cancellation operation changed: %',
            pg_catalog.jsonb_build_object('payment', v_payment, 'operation', v_operation);
    end if;

    update stripe_connect.payments set description = 'fresh replay snapshot'
    where id = v_payment_id;
    select result.payment, result.operation
    into strict v_payment, v_operation
    from stripe_connect.reserve_payment_cancellation_operation(
        v_payment_id, v_reference, v_key, v_request
    ) result;
    if v_payment->>'description' <> 'fresh replay snapshot'
       or v_operation is distinct from v_expected_operation then
        raise exception 'provider reconciliation: cancellation operation replay changed';
    end if;

    perform provider_reconciliation_test.expect_cancellation_operation_error(
        -900000001, 'missing', 'provider-reconciliation-pg-cancellation-missing',
        '{}'::jsonb,
        'conflict: payment cancellation lifecycle guard does not match provider payment truth'
    );
    perform provider_reconciliation_test.expect_cancellation_operation_error(
        v_payment_id, 'different-reference', '', '[]'::jsonb,
        'conflict: payment cancellation lifecycle guard does not match provider payment truth'
    );
    perform provider_reconciliation_test.expect_cancellation_operation_error(
        v_payment_id, v_reference, '', v_request,
        'validation: business key is required'
    );
    perform provider_reconciliation_test.expect_cancellation_operation_error(
        v_payment_id, v_reference,
        'provider-reconciliation-pg-cancellation-invalid-request', '[]'::jsonb,
        'validation: operation request must be an object'
    );
    perform provider_reconciliation_test.expect_cancellation_operation_error(
        v_payment_id, v_reference, v_key, v_request || '{"reason":"changed"}',
        'conflict: financial operation replay mismatch'
    );
    perform provider_reconciliation_test.expect_cancellation_operation_error(
        v_other_payment_id,
        'provider-reconciliation-pg-cancellation-operation-other',
        v_key, v_request,
        'conflict: financial operation replay mismatch'
    );
    if (select pg_catalog.count(*) from stripe_connect.financial_operations
        where business_key like 'provider-reconciliation-pg-cancellation-%') <> 1 then
        raise exception 'provider reconciliation: cancellation errors reserved work';
    end if;
end;
$cancellation_operation$;

select provider_reconciliation_test.cleanup();
