

create or replace function stripe_connect.read_refund_projection_context(
    p_payment_id bigint
)
returns table (
    refunded_amount numeric,
    actual_stripe_refund_fee_amount numeric,
    payment jsonb,
    seller_recovery_amount numeric
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_refunded_amount numeric;
    v_actual_stripe_refund_fee_amount numeric;
    v_payment jsonb;
    v_seller_recovery_amount numeric;
begin
    -- VOLATILE is deliberate: each SELECT retains the fresh READ COMMITTED
    -- observation point of the former sequential PostgREST requests.
    select coalesce(pg_catalog.sum(refund_row.amount), 0)
    into v_refunded_amount
    from stripe_connect.refunds refund_row
    where refund_row.payment_id = p_payment_id
      and refund_row.status = 'succeeded';

    select coalesce(pg_catalog.sum(refund_row.actual_stripe_fee_amount), 0)
    into v_actual_stripe_refund_fee_amount
    from stripe_connect.refunds refund_row
    where refund_row.payment_id = p_payment_id
      and refund_row.status = 'succeeded';

    select pg_catalog.to_jsonb(payment_row)
    into v_payment
    from stripe_connect.payments payment_row
    where payment_row.id = p_payment_id;

    if v_payment is null then
        return query select
            v_refunded_amount,
            v_actual_stripe_refund_fee_amount,
            null::jsonb,
            0::numeric;
        return;
    end if;

    select coalesce(
        pg_catalog.sum(refund_row.seller_entitlement_reduction_amount),
        0
    )
    into v_seller_recovery_amount
    from stripe_connect.refunds refund_row
    where refund_row.payment_id = p_payment_id
      and refund_row.status = 'succeeded';

    return query select
        v_refunded_amount,
        v_actual_stripe_refund_fee_amount,
        v_payment,
        v_seller_recovery_amount;
end;
$$;

revoke execute on function stripe_connect.read_refund_projection_context(bigint)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_refund_projection_context(bigint)
    to service_role;