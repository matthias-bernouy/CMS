

create or replace function stripe_connect.read_financial_operation_recovery_context(
    p_payment_id bigint,
    p_operation_id bigint,
    p_recovery_request_id text
)
returns table (
    payment jsonb,
    transfer jsonb,
    transfer_reversal jsonb,
    transfer_recovery jsonb,
    refund jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        case when payment_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(payment_row) end as payment,
        case when transfer_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(transfer_row) end as transfer,
        case when reversal_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(reversal_row) end as transfer_reversal,
        case when recovery_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(recovery_row) end as transfer_recovery,
        case when refund_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(refund_row) end as refund
    from (values (true)) singleton(present)
    left join stripe_connect.payments payment_row
        on payment_row.id = p_payment_id
    left join stripe_connect.transfers transfer_row
        on transfer_row.operation_id = p_operation_id
    left join stripe_connect.transfer_reversals reversal_row
        on reversal_row.operation_id = p_operation_id
    left join stripe_connect.transfer_recovery_requests recovery_row
        on recovery_row.recovery_request_id = p_recovery_request_id
    left join stripe_connect.refunds refund_row
        on refund_row.operation_id = p_operation_id
$$;

revoke execute on function stripe_connect.read_financial_operation_recovery_context(bigint, bigint, text)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_financial_operation_recovery_context(bigint, bigint, text)
    to service_role;
