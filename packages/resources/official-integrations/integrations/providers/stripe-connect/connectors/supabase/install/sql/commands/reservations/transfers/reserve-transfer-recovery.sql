

create or replace function stripe_connect.reserve_transfer_recovery(
    p_payment_id bigint,
    p_recovery_request_id text,
    p_amount bigint,
    p_exposure_type text,
    p_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_recovery stripe_connect.transfer_recovery_requests%rowtype;
    v_transfer stripe_connect.transfers%rowtype;
    v_operation stripe_connect.financial_operations%rowtype;
    v_reversal stripe_connect.transfer_reversals%rowtype;
    v_reserved bigint;
    v_available bigint;
    v_allocation bigint;
    v_allocated bigint := 0;
    v_remaining bigint;
    v_index integer := 0;
    v_child_key text;
    v_business_key text;
    v_allocations jsonb;
begin
    if p_recovery_request_id is null or length(btrim(p_recovery_request_id)) = 0 then
        raise exception 'validation: recovery request id is required';
    end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'validation: recovery amount must be positive';
    end if;
    if p_exposure_type not in ('chargeback', 'refund_recovery', 'manual') then
        raise exception 'validation: recovery exposure type is invalid';
    end if;
    select * into v_payment from stripe_connect.payments
    where id = p_payment_id for update;
    if not found then raise exception 'not_found: payment'; end if;

    select * into v_recovery from stripe_connect.transfer_recovery_requests
    where recovery_request_id = p_recovery_request_id for update;
    if found then
        if v_recovery.payment_id is distinct from p_payment_id
            or v_recovery.requested_amount is distinct from p_amount
            or v_recovery.currency is distinct from v_payment.currency
            or v_recovery.exposure_type is distinct from p_exposure_type
            or v_recovery.reason is distinct from p_reason then
            raise exception 'conflict: transfer recovery replay mismatch';
        end if;
    else
        insert into stripe_connect.transfer_recovery_requests (
            payment_id, recovery_request_id, exposure_type,
            requested_amount, currency, reason
        ) values (
            p_payment_id, p_recovery_request_id, p_exposure_type,
            p_amount, v_payment.currency, p_reason
        ) returning * into v_recovery;

        v_remaining := p_amount;
        for v_transfer in
            select transfer.*
            from stripe_connect.transfers transfer
            where transfer.payment_id = p_payment_id
              and transfer.status in ('succeeded', 'partially_reversed')
              and transfer.stripe_transfer_id is not null
            order by transfer.created_at desc, transfer.id desc
            for update
        loop
            -- The link projects at most 24 operations atomically: 23 reversal
            -- children followed by one refund. Anything larger fails closed as
            -- an allocation shortfall instead of succeeding only at Stripe.
            exit when v_index >= 23;
            select coalesce(sum(reversal.amount), 0) into v_reserved
            from stripe_connect.transfer_reversals reversal
            where reversal.transfer_id = v_transfer.id
              and reversal.status in ('reserved', 'processing', 'succeeded', 'manual_review');
            v_available := greatest(0, v_transfer.amount - v_reserved);
            if v_available = 0 then continue; end if;
            v_allocation := least(v_remaining, v_available);
            v_index := v_index + 1;
            v_child_key := p_recovery_request_id || ':part:' || v_index || ':transfer:' || v_transfer.id;
            v_business_key := 'reversal:' || p_payment_id || ':' || v_child_key;
            insert into stripe_connect.financial_operations (
                payment_id, business_key, operation_type, request
            ) values (
                p_payment_id, v_business_key, 'transfer_reversal_create',
                jsonb_build_object(
                    'recoveryRequestId', p_recovery_request_id,
                    'reversalRequestId', v_child_key,
                    'transferId', v_transfer.stripe_transfer_id,
                    'amount', v_allocation,
                    'currency', v_payment.currency,
                    'reason', p_reason,
                    'allocationIndex', v_index
                )
            ) returning * into v_operation;
            insert into stripe_connect.transfer_reversals (
                payment_id, recovery_id, allocation_index, transfer_id,
                operation_id, reversal_request_id, amount, currency, reason, status
            ) values (
                p_payment_id, v_recovery.id, v_index, v_transfer.id,
                v_operation.id, v_child_key, v_allocation, v_payment.currency,
                p_reason, 'reserved'
            ) returning * into v_reversal;
            v_allocated := v_allocated + v_allocation;
            v_remaining := v_remaining - v_allocation;
            exit when v_remaining = 0;
        end loop;
        update stripe_connect.transfer_recovery_requests set
            allocated_amount = v_allocated,
            allocation_shortfall_amount = p_amount - v_allocated,
            status = case when v_allocated = 0 then 'manual_review' else 'reserved' end,
            last_error = case when v_allocated < p_amount
                then 'confirmed Transfers cannot cover the requested recovery' end
        where id = v_recovery.id returning * into v_recovery;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'reversal', to_jsonb(reversal),
        'operation', to_jsonb(operation_row),
        'transfer', to_jsonb(transfer_row)
    ) order by reversal.allocation_index), '[]'::jsonb)
    into v_allocations
    from stripe_connect.transfer_reversals reversal
    join stripe_connect.financial_operations operation_row on operation_row.id = reversal.operation_id
    join stripe_connect.transfers transfer_row on transfer_row.id = reversal.transfer_id
    where reversal.recovery_id = v_recovery.id;
    return jsonb_build_object(
        'recovery', to_jsonb(v_recovery),
        'allocations', v_allocations
    );
end;
$$;
