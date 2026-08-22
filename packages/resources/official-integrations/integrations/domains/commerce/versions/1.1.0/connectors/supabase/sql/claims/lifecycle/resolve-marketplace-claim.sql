-- Compatibility wrapper for direct callers that still submit one aggregate
-- buyer refund. Stable integrations use resolve_allocated_marketplace_claim so
-- shipping, merchandise, and protection-fee decisions remain auditable.
create or replace function commerce.resolve_marketplace_claim(
    p_claim_id bigint,
    p_outcome text,
    p_buyer_refund_amount bigint,
    p_seller_transfer_amount bigint,
    p_protection_fee_refund_amount bigint,
    p_decision_reason text,
    p_actor_kind text,
    p_actor_id text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_claim commerce.marketplace_claims%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_non_fee_refund bigint;
    v_merchandise_refund bigint;
    v_shipping_refund bigint;
begin
    if p_buyer_refund_amount is null or p_buyer_refund_amount < 0
        or p_protection_fee_refund_amount is null
        or p_protection_fee_refund_amount < 0
        or p_protection_fee_refund_amount > p_buyer_refund_amount then
        raise exception 'validation: legacy claim refund amount is invalid';
    end if;
    select * into v_claim
    from commerce.marketplace_claims
    where id = p_claim_id;
    if not found then raise exception 'not_found: claim'; end if;
    select * into v_terms
    from commerce.order_financial_terms
    where order_id = v_claim.order_id;
    if not found then
        raise exception 'conflict: claim resolution requires immutable financial terms';
    end if;
    v_non_fee_refund := p_buyer_refund_amount - p_protection_fee_refund_amount;
    v_merchandise_refund := least(
        v_non_fee_refund,
        v_terms.merchandise_subtotal_amount
    );
    v_shipping_refund := v_non_fee_refund - v_merchandise_refund;
    if v_shipping_refund > v_terms.shipping_amount then
        raise exception 'validation: legacy claim refund cannot be allocated to immutable financial terms';
    end if;
    return commerce.resolve_allocated_marketplace_claim(
        p_claim_id,
        p_outcome,
        v_merchandise_refund,
        v_shipping_refund,
        p_seller_transfer_amount,
        p_protection_fee_refund_amount,
        p_decision_reason,
        p_actor_kind,
        p_actor_id,
        p_expected_version
    );
end;
$$;
