

create or replace function stripe_connect.reserve_payment_cancellation_operation(
    p_payment_id bigint,
    p_client_reference_id text,
    p_business_key text,
    p_request jsonb
)
returns table (
    payment jsonb,
    operation jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_payment jsonb;
    v_operation jsonb;
begin
    -- Keep this read separate from the reservation statement. Under READ
    -- COMMITTED, the nested reservation must retain its later observation point.
    select pg_catalog.to_jsonb(payment_row)
    into v_payment
    from stripe_connect.payments payment_row
    where payment_row.id = p_payment_id;

    if v_payment is null
       or v_payment->>'client_reference_id' is distinct from p_client_reference_id then
        raise exception 'conflict: payment cancellation lifecycle guard does not match provider payment truth';
    end if;

    select stripe_connect.reserve_financial_operation(
        p_payment_id,
        p_business_key,
        'payment_intent_cancel',
        p_request
    ) into v_operation;

    return query select v_payment, v_operation;
end;
$$;

revoke execute on function stripe_connect.reserve_payment_cancellation_operation(
    bigint, text, text, jsonb
) from public, anon, authenticated;
grant execute on function stripe_connect.reserve_payment_cancellation_operation(
    bigint, text, text, jsonb
) to service_role;
