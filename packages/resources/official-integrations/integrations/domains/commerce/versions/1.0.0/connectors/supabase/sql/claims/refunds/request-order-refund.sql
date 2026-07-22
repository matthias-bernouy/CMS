

create or replace function commerce.request_order_refund(
    p_order_id bigint,
    p_reason text,
    p_requested_amount bigint,
    p_actor_kind text,
    p_actor_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_terms commerce.order_financial_terms%rowtype;
    v_component commerce.fee_policy_components%rowtype;
    v_existing_amount bigint;
    v_existing_protection_refund bigint;
    v_existing_seller_recovery bigint;
    v_protection_refund bigint;
    v_seller_recovery bigint;
    v_remaining_non_fee bigint;
    v_request jsonb;
begin
    if p_actor_kind is distinct from 'admin' then
        raise exception 'forbidden: admin refund request actor is required';
    end if;
    select * into v_terms from commerce.order_financial_terms where order_id = p_order_id;
    if not found then raise exception 'conflict: refund requires immutable financial terms'; end if;
    select coalesce(sum(requested_amount), 0),
        coalesce(sum(protection_fee_refund_amount), 0),
        coalesce(sum(seller_recovery_amount), 0)
    into v_existing_amount, v_existing_protection_refund, v_existing_seller_recovery
    from commerce.refund_requests
    where order_id = p_order_id and status not in ('rejected', 'cancelled', 'failed');
    v_protection_refund := commerce.calculate_protection_fee_refund(
        p_order_id, p_requested_amount, 0
    );
    v_remaining_non_fee := greatest(
        0,
        v_terms.buyer_total_amount - v_terms.buyer_protection_fee_amount
            - (v_existing_amount - v_existing_protection_refund)
    );
    if p_requested_amount <= 0 or p_requested_amount > v_remaining_non_fee + v_protection_refund then
        raise exception 'validation: requested refund includes a non-refundable protection fee';
    end if;
    v_seller_recovery := least(
        p_requested_amount - v_protection_refund,
        greatest(0, v_terms.seller_proceeds_amount - v_existing_seller_recovery)
    );
    v_request := commerce.create_refund_request(
        p_order_id, null, null, p_reason, p_requested_amount,
        v_protection_refund, v_seller_recovery,
        p_actor_kind, p_actor_id, true
    );
    return v_request || jsonb_build_object(
        'refundAuthorization', commerce.refund_authorization_payload((v_request->>'id')::bigint)
    );
end;
$$;