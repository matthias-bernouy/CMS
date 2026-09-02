

create or replace function stripe_connect.enqueue_commerce_financial_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_kind text;
    v_recovery_key text;
    v_sequence integer;
begin
    if new.status <> 'succeeded' or new.payment_id is null then return new; end if;
    v_kind := case new.operation_type
        when 'transfer_create' then 'transfer'
        when 'transfer_reversal_create' then 'reversal'
        else null
    end;
    if v_kind is null then return new; end if;
    v_recovery_key := case
        when v_kind = 'reversal' then nullif(new.request->>'recoveryRequestId', '')
        else null
    end;
    v_sequence := case
        when v_kind = 'reversal' then coalesce((new.request->>'allocationIndex')::integer, 0)
        else 0
    end;
    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind, recovery_key, causal_sequence
    ) values (
        new.id, new.payment_id, 'operation:' || new.id, v_kind, v_recovery_key, v_sequence
    ) on conflict (projection_key) do nothing;
    return new;
end;
$$;