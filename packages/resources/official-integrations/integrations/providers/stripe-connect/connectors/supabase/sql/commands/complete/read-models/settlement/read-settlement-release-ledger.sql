

create or replace function stripe_connect.read_settlement_release_ledger(
    p_payment_id bigint
)
returns table (
    transferred_amount numeric,
    reversed_amount numeric,
    seller_recovery_amount numeric
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_transferred_amount numeric;
    v_reversed_amount numeric;
    v_seller_recovery_amount numeric;
begin
    -- These totals are read after the provider write. Keep their three fresh
    -- snapshots and their historical transfer -> reversal -> refund order.
    select coalesce(pg_catalog.sum(transfer_row.amount), 0)
    into v_transferred_amount
    from stripe_connect.transfers transfer_row
    where transfer_row.payment_id = p_payment_id
      and transfer_row.status in (
          'succeeded', 'partially_reversed', 'reversed'
      );

    select coalesce(pg_catalog.sum(reversal_row.amount), 0)
    into v_reversed_amount
    from stripe_connect.transfer_reversals reversal_row
    where reversal_row.payment_id = p_payment_id
      and reversal_row.status = 'succeeded';

    select coalesce(
        pg_catalog.sum(refund_row.seller_entitlement_reduction_amount),
        0
    )
    into v_seller_recovery_amount
    from stripe_connect.refunds refund_row
    where refund_row.payment_id = p_payment_id
      and refund_row.status = 'succeeded';

    return query select
        v_transferred_amount,
        v_reversed_amount,
        v_seller_recovery_amount;
end;
$$;

revoke execute on function stripe_connect.read_settlement_release_ledger(bigint)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_settlement_release_ledger(bigint)
    to service_role;