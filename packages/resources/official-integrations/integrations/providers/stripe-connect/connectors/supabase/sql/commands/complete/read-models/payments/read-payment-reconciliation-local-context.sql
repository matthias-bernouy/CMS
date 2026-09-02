

create or replace function stripe_connect.read_payment_reconciliation_local_context(
    p_payment_id bigint
)
returns table (
    payment jsonb,
    refunds jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        (
            select pg_catalog.to_jsonb(payment_row)
            from stripe_connect.payments payment_row
            where payment_row.id = p_payment_id
        ) as payment,
        coalesce((
            select pg_catalog.jsonb_agg(
                pg_catalog.to_jsonb(refund_row) order by refund_row.id
            )
            from stripe_connect.refunds refund_row
            where refund_row.payment_id = p_payment_id
        ), '[]'::jsonb) as refunds
$$;

revoke execute on function stripe_connect.read_payment_reconciliation_local_context(bigint)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_payment_reconciliation_local_context(bigint)
    to service_role;