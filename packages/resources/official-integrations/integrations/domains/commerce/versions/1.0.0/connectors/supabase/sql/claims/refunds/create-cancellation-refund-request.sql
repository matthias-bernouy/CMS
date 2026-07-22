

create or replace function commerce.create_cancellation_refund_request(
    p_order_id bigint,
    p_business_key text,
    p_reason text,
    p_requested_by_kind text,
    p_requested_by text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_terms commerce.order_financial_terms%rowtype;
    v_component commerce.fee_policy_components%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_existing_amount bigint;
    v_existing_protection_refund bigint;
    v_remaining_captured bigint;
    v_remaining_fee bigint;
    v_requested_amount bigint;
    v_protection_refund bigint;
    v_seller_recovery bigint;
begin
    select * into v_terms
    from commerce.order_financial_terms
    where order_id = p_order_id;
    if not found then
        raise exception 'conflict: cancellation refund requires immutable financial terms';
    end if;
    select * into v_component
    from commerce.fee_policy_components
    where fee_policy_id = v_terms.fee_policy_id
      and component_key = 'buyer_protection';
    if not found then
        raise exception 'conflict: buyer protection refund policy is missing';
    end if;
    select * into v_settlement
    from commerce.order_settlements
    where order_id = p_order_id;
    if not found then
        raise exception 'conflict: cancellation refund requires a settlement';
    end if;
    select coalesce(sum(requested_amount), 0),
        coalesce(sum(protection_fee_refund_amount), 0)
    into v_existing_amount, v_existing_protection_refund
    from commerce.refund_requests
    where order_id = p_order_id
      and status not in ('rejected', 'cancelled', 'failed');
    v_remaining_captured := greatest(0, v_terms.buyer_total_amount - v_existing_amount);
    v_remaining_fee := greatest(
        0,
        v_terms.buyer_protection_fee_amount - v_existing_protection_refund
    );
    v_requested_amount := greatest(
        0,
        v_remaining_captured - case
            when v_component.refund_policy = 'never' then v_remaining_fee
            else 0
        end
    );
    if v_requested_amount = 0 then
        return null;
    end if;
    v_protection_refund := commerce.calculate_protection_fee_refund(
        p_order_id,
        v_requested_amount,
        case when v_component.refund_policy = 'resolution_defined'
            then least(v_requested_amount, v_remaining_fee)
            else null end
    );
    v_seller_recovery := least(
        v_settlement.authorized_seller_amount,
        greatest(0, v_requested_amount - v_protection_refund)
    );
    return commerce.create_refund_request(
        p_order_id, null, p_business_key, p_reason, v_requested_amount,
        v_protection_refund, v_seller_recovery,
        p_requested_by_kind, p_requested_by, true
    );
end;
$$;