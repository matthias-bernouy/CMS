

create or replace function stripe_connect.read_reconciliation_operations(
    p_limit integer default 50
)
returns table (
    operation jsonb,
    client_reference_id text,
    payment_currency text
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        pg_catalog.to_jsonb(selected_operation),
        payment.client_reference_id,
        payment.currency
    from (
        select operation.*
        from stripe_connect.financial_operations operation
        order by operation.updated_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) selected_operation
    left join stripe_connect.payments payment
        on payment.id = selected_operation.payment_id
    order by selected_operation.updated_at desc
$$;

revoke execute on function stripe_connect.read_reconciliation_operations(integer)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_reconciliation_operations(integer)
    to service_role;