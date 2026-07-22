

insert into stripe_connect.commerce_projection_outbox (
    operation_id, payment_id, projection_key, projection_kind, recovery_key, causal_sequence
)
select operation.id, operation.payment_id, 'operation:' || operation.id,
    case operation.operation_type
        when 'transfer_create' then 'transfer'
        when 'transfer_reversal_create' then 'reversal'
        else null
    end,
    case
        when operation.operation_type = 'transfer_reversal_create'
            then nullif(operation.request->>'recoveryRequestId', '')
        else null
    end,
    case
        when operation.operation_type = 'transfer_reversal_create'
            then coalesce((operation.request->>'allocationIndex')::integer, 0)
        else 0
    end
from stripe_connect.financial_operations operation
where operation.status = 'succeeded'
  and operation.payment_id is not null
  and operation.operation_type in ('transfer_create', 'transfer_reversal_create')
on conflict (projection_key) do nothing;