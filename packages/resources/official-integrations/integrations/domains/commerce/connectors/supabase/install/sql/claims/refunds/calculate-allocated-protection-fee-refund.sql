create or replace function commerce.calculate_allocated_protection_fee_refund(
    p_order_id bigint,
    p_requested_amount bigint,
    p_merchandise_refund_amount bigint,
    p_resolution_defined_amount bigint default null
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
    v_terms commerce.order_financial_terms%rowtype;
    v_component commerce.fee_policy_components%rowtype;
    v_existing_amount bigint;
    v_existing_merchandise_refund bigint;
    v_existing_protection_refund bigint;
    v_remaining_fee bigint;
    v_result bigint;
begin
    if p_requested_amount is null or p_requested_amount <= 0 then
        raise exception 'validation: protection fee calculation requires a positive refund amount';
    end if;
    if p_merchandise_refund_amount is null
        or p_merchandise_refund_amount < 0
        or p_merchandise_refund_amount > p_requested_amount then
        raise exception 'validation: merchandise refund allocation is invalid';
    end if;
    select * into v_terms
    from commerce.order_financial_terms
    where order_id = p_order_id;
    if not found then
        raise exception 'conflict: refund requires immutable financial terms';
    end if;
    select * into v_component
    from commerce.fee_policy_components
    where fee_policy_id = v_terms.fee_policy_id
      and component_key = 'buyer_protection';
    if not found then
        raise exception 'conflict: buyer protection refund policy is missing';
    end if;
    if exists (
        select 1
        from commerce.refund_requests
        where order_id = p_order_id
          and status not in ('rejected', 'cancelled', 'failed')
          and allocation_version = 0
    ) then
        raise exception 'conflict: a legacy refund allocation requires manual reconciliation';
    end if;
    select
        coalesce(sum(requested_amount), 0),
        coalesce(sum(merchandise_refund_amount), 0),
        coalesce(sum(protection_fee_refund_amount), 0)
    into
        v_existing_amount,
        v_existing_merchandise_refund,
        v_existing_protection_refund
    from commerce.refund_requests
    where order_id = p_order_id
      and status not in ('rejected', 'cancelled', 'failed');
    if v_existing_amount + p_requested_amount > v_terms.buyer_total_amount then
        raise exception 'validation: cumulative refund requests exceed captured buyer total';
    end if;
    if v_existing_merchandise_refund + p_merchandise_refund_amount
        > v_terms.merchandise_subtotal_amount then
        raise exception 'validation: cumulative merchandise refunds exceed immutable financial terms';
    end if;
    v_remaining_fee := greatest(
        0,
        v_terms.buyer_protection_fee_amount - v_existing_protection_refund
    );
    v_result := case v_component.refund_policy
        when 'always' then least(p_requested_amount, v_remaining_fee)
        when 'never' then 0
        when 'proportional' then
            case when v_terms.merchandise_subtotal_amount = 0 then 0 else
                least(
                    p_requested_amount,
                    v_remaining_fee,
                    greatest(
                        0,
                        floor(
                            (
                                v_terms.buyer_protection_fee_amount::numeric
                                * (v_existing_merchandise_refund + p_merchandise_refund_amount)
                                + v_terms.merchandise_subtotal_amount / 2
                            )
                            / v_terms.merchandise_subtotal_amount
                        )::bigint - v_existing_protection_refund
                    )
                )
            end
        when 'resolution_defined' then coalesce(p_resolution_defined_amount, 0)
        else 0
    end;
    if v_component.refund_policy = 'resolution_defined'
        and (v_result < 0 or v_result > least(p_requested_amount, v_remaining_fee)) then
        raise exception 'validation: resolution-defined protection fee refund exceeds the remaining policy amount';
    end if;
    return v_result;
end;
$$;
