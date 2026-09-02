

create or replace function stripe_connect.claim_financial_operations(p_limit integer default 50)
returns setof stripe_connect.financial_operations
language plpgsql
set search_path = ''
as $$
begin
    return query
    with candidates as (
        select operation.id
        from stripe_connect.financial_operations as operation
        where operation.operation_type in (
                'payment_intent_create', 'payment_intent_cancel', 'transfer_create',
                'transfer_reversal_create', 'refund_create', 'payout_schedule_update'
            )
          and operation.status in ('reserved', 'processing', 'failed')
          and operation.attempt_count < 5
          and operation.created_at <= now() - interval '1 minute'
          and (operation.next_attempt_at is null or operation.next_attempt_at <= now())
          and (
              operation.status <> 'processing'
              or operation.claimed_at is null
              or operation.claimed_at <= now() - interval '5 minutes'
          )
        order by operation.created_at asc
        for update skip locked
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    update stripe_connect.financial_operations as operation
    set status = 'processing',
        claimed_at = now(),
        attempt_count = operation.attempt_count + 1,
        last_error = null
    from candidates
    where operation.id = candidates.id
    returning operation.*;
end;
$$;