

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
    v_existing_merchandise_refund bigint;
    v_existing_shipping_refund bigint;
    v_existing_protection_refund bigint;
    v_merchandise_refund bigint;
    v_shipping_refund bigint;
    v_remaining_fee bigint;
    v_protection_refund bigint;
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
    select
        coalesce(sum(merchandise_refund_amount), 0),
        coalesce(sum(shipping_refund_amount), 0),
        coalesce(sum(protection_fee_refund_amount), 0)
    into
        v_existing_merchandise_refund,
        v_existing_shipping_refund,
        v_existing_protection_refund
    from commerce.refund_requests
    where order_id = p_order_id
      and status not in ('rejected', 'cancelled', 'failed');
    v_merchandise_refund := greatest(
        0,
        v_terms.merchandise_subtotal_amount - v_existing_merchandise_refund
    );
    v_shipping_refund := greatest(
        0,
        v_terms.shipping_amount - v_existing_shipping_refund
    );
    v_remaining_fee := greatest(
        0,
        v_terms.buyer_protection_fee_amount - v_existing_protection_refund
    );
    v_protection_refund := case
        when v_component.refund_policy = 'never' then 0
        else v_remaining_fee
    end;
    if v_merchandise_refund + v_shipping_refund + v_protection_refund = 0 then
        return null;
    end if;
    return commerce.create_allocated_refund_request(
        p_order_id, null, p_business_key, p_reason,
        v_merchandise_refund, v_shipping_refund, v_protection_refund,
        p_requested_by_kind, p_requested_by, true
    );
end;
$$;
