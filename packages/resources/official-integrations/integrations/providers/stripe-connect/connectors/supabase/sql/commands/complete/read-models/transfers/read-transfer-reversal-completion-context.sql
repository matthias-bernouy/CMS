

create or replace function stripe_connect.read_transfer_reversal_completion_context(
    p_payment_id bigint
)
returns table (
    reversed_amount numeric,
    payment jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_reversed_amount numeric;
    v_payment jsonb;
begin
    -- Keep the aggregate before the payment read. Each statement deliberately
    -- retains the fresh READ COMMITTED snapshot of the former PostgREST calls.
    select coalesce(pg_catalog.sum(reversal_row.amount), 0)
    into v_reversed_amount
    from stripe_connect.transfer_reversals reversal_row
    where reversal_row.payment_id = p_payment_id
      and reversal_row.status = 'succeeded';

    select pg_catalog.to_jsonb(payment_row)
    into v_payment
    from stripe_connect.payments payment_row
    where payment_row.id = p_payment_id;

    return query select v_reversed_amount, v_payment;
end;
$$;

revoke execute on function stripe_connect.read_transfer_reversal_completion_context(bigint)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_transfer_reversal_completion_context(bigint)
    to service_role;