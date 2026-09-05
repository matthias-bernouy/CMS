

create or replace function stripe_connect.read_provider_transfer_reconciliation_context(
    p_stripe_transfer_id text
)
returns table (
    transfer jsonb,
    local_reversed_amount numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        case
            when selected_transfer.id is null then null::jsonb
            else pg_catalog.to_jsonb(selected_transfer)
        end as transfer,
        coalesce(reversal_totals.local_reversed_amount, 0) as local_reversed_amount
    from (values (true)) singleton(present)
    left join lateral (
        select candidate.*
        from stripe_connect.transfers candidate
        where candidate.stripe_transfer_id = p_stripe_transfer_id
    ) selected_transfer on singleton.present
    left join lateral (
        select pg_catalog.sum(reversal.amount) as local_reversed_amount
        from stripe_connect.transfer_reversals reversal
        where reversal.transfer_id = selected_transfer.id
          and reversal.status = 'succeeded'
    ) reversal_totals on true
$$;

revoke execute on function stripe_connect.read_provider_transfer_reconciliation_context(text)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_provider_transfer_reconciliation_context(text)
    to service_role;
