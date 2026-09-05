

create or replace function stripe_connect.read_payment_reconciliation_ledger(
    p_payment_id bigint
)
returns table (
    refunded_amount numeric,
    transferred_amount numeric,
    reversed_amount numeric,
    seller_recovery_amount numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
    with refund_totals as (
        select
            coalesce(pg_catalog.sum(refund.amount), 0) as refunded_amount,
            coalesce(
                pg_catalog.sum(refund.seller_entitlement_reduction_amount), 0
            ) as seller_recovery_amount
        from stripe_connect.refunds refund
        where refund.payment_id = p_payment_id
          and refund.status = 'succeeded'
    ),
    transfer_totals as (
        select coalesce(pg_catalog.sum(transfer.amount), 0) as transferred_amount
        from stripe_connect.transfers transfer
        where transfer.payment_id = p_payment_id
          and transfer.status in ('succeeded', 'partially_reversed', 'reversed')
    ),
    reversal_totals as (
        select coalesce(pg_catalog.sum(reversal.amount), 0) as reversed_amount
        from stripe_connect.transfer_reversals reversal
        where reversal.payment_id = p_payment_id
          and reversal.status = 'succeeded'
    )
    select
        refund_totals.refunded_amount,
        transfer_totals.transferred_amount,
        reversal_totals.reversed_amount,
        refund_totals.seller_recovery_amount
    from refund_totals
    cross join transfer_totals
    cross join reversal_totals
$$;

revoke execute on function stripe_connect.read_payment_reconciliation_ledger(bigint)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_payment_reconciliation_ledger(bigint)
    to service_role;
