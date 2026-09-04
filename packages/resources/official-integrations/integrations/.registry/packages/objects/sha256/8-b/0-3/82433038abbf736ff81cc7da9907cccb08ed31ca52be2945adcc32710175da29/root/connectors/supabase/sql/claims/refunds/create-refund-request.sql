

create or replace function commerce.create_refund_request(
    p_order_id bigint,
    p_claim_id bigint,
    p_business_key text,
    p_reason text,
    p_requested_amount bigint,
    p_protection_fee_refund_amount bigint,
    p_seller_recovery_amount bigint,
    p_requested_by_kind text,
    p_requested_by text,
    p_auto_approve boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_existing_amount bigint;
    v_existing_protection_refund bigint;
    v_existing_seller_recovery bigint;
    v_existing_platform_contribution bigint;
    v_platform_contribution bigint;
    v_platform_contribution_cap bigint;
    v_cumulative_amount bigint;
    v_expected_protection_refund bigint;
    v_requires_finance boolean;
    v_requires_dual boolean;
    v_request commerce.refund_requests%rowtype;
    v_business_key text;
begin
    if p_requested_by_kind is null
        or p_requested_by_kind not in ('buyer', 'seller', 'admin', 'system')
        or p_requested_by is null or length(btrim(p_requested_by)) = 0 then
        raise exception 'forbidden: refund request actor is not allowed';
    end if;
    select * into v_order from commerce.orders where id = p_order_id for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    if not found then raise exception 'conflict: refund requires immutable financial terms'; end if;
    if not exists (
        select 1 from commerce.order_payment_attempts attempt
        where attempt.order_id = v_order.id and attempt.status = 'succeeded'
    ) then raise exception 'conflict: refund requires confirmed payment'; end if;
    select * into v_protection from commerce.protection_policies where id = v_terms.protection_policy_id;
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id for update;
    select coalesce(sum(requested_amount), 0),
        coalesce(sum(protection_fee_refund_amount), 0),
        coalesce(sum(seller_recovery_amount), 0),
        coalesce(sum(
            requested_amount - protection_fee_refund_amount - seller_recovery_amount
        ), 0)
    into v_existing_amount, v_existing_protection_refund, v_existing_seller_recovery,
        v_existing_platform_contribution
    from commerce.refund_requests
    where order_id = v_order.id and status not in ('rejected', 'cancelled', 'failed');
    if p_requested_amount <= 0 or p_requested_amount + v_existing_amount > v_terms.buyer_total_amount then
        raise exception 'validation: cumulative refund requests exceed captured buyer total';
    end if;
    v_expected_protection_refund := commerce.calculate_protection_fee_refund(
        v_order.id, p_requested_amount, p_protection_fee_refund_amount
    );
    if p_protection_fee_refund_amount is distinct from v_expected_protection_refund then
        raise exception 'validation: protection fee refund does not match the immutable fee policy';
    end if;
    if p_protection_fee_refund_amount < 0 or p_protection_fee_refund_amount > p_requested_amount
        or p_seller_recovery_amount < 0 or p_seller_recovery_amount > p_requested_amount then
        raise exception 'validation: invalid refund allocation';
    end if;
    if p_protection_fee_refund_amount + p_seller_recovery_amount > p_requested_amount
        or v_existing_protection_refund + p_protection_fee_refund_amount > v_terms.buyer_protection_fee_amount
        or v_existing_seller_recovery + p_seller_recovery_amount > v_terms.seller_proceeds_amount then
        raise exception 'validation: cumulative refund allocation exceeds immutable financial terms';
    end if;
    v_platform_contribution := p_requested_amount
        - p_protection_fee_refund_amount - p_seller_recovery_amount;
    v_platform_contribution_cap := greatest(
        0,
        v_terms.platform_retained_amount - v_terms.buyer_protection_fee_amount
    );
    if v_platform_contribution < 0
        or v_existing_platform_contribution + v_platform_contribution
            > v_platform_contribution_cap then
        raise exception 'validation: cumulative platform-funded refund exceeds immutable platform contribution';
    end if;
    v_cumulative_amount := v_existing_amount + p_requested_amount;
    v_requires_finance := v_cumulative_amount >= v_protection.finance_review_threshold_amount
        or p_requested_by_kind = 'admin';
    v_requires_dual := v_cumulative_amount >= v_protection.dual_approval_threshold_amount;
    v_business_key := coalesce(
        nullif(btrim(p_business_key), ''),
        'refund:' || v_order.id || ':' || gen_random_uuid()::text
    );
    insert into commerce.refund_requests (
        order_id, claim_id, business_key, reason, status, requested_amount,
        protection_fee_refund_amount, seller_recovery_amount, seller_reserve_offset_amount,
        requires_finance_approval, dual_approval_required, requested_by_kind, requested_by,
        approved_by, decision_reason
    ) values (
        v_order.id, p_claim_id, v_business_key, p_reason,
        case when p_auto_approve and not v_requires_finance then 'approved' else 'requested' end,
        p_requested_amount, p_protection_fee_refund_amount, p_seller_recovery_amount,
        least(p_seller_recovery_amount, v_settlement.seller_reserve_liability_remaining_amount),
        v_requires_finance, v_requires_dual, p_requested_by_kind, p_requested_by,
        case when p_auto_approve and not v_requires_finance then p_requested_by end,
        case when p_auto_approve and not v_requires_finance then 'Policy-authorized business resolution' end
    ) on conflict (business_key) do update set business_key = excluded.business_key
    returning * into v_request;
    update commerce.order_settlements set status = case
        when total_transferred_amount > total_reversed_amount
          and v_request.seller_recovery_amount > v_request.seller_reserve_offset_amount
            then 'reversal_pending'
        else 'refund_pending' end
    where order_id = v_order.id and status not in ('refunded', 'reversed', 'manual_review');
    perform commerce.append_financial_event(
        v_order.id, 'refund_request', v_request.id::text, 'refund_requested',
        p_requested_by_kind, p_requested_by, p_reason,
        jsonb_build_object('amount', p_requested_amount, 'requiresFinanceApproval', v_requires_finance),
        'commerce.refund.requested', 'refund:' || v_request.id || ':requested'
    );
    return to_jsonb(v_request);
end;
$$;
