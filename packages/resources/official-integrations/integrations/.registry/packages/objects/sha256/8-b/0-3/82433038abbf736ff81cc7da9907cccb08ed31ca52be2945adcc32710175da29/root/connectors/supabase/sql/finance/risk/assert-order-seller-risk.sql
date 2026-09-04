

create or replace function commerce.assert_order_seller_risk(
    p_order_id bigint,
    p_stage text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_risk commerce.seller_risk_policies%rowtype;
    v_state commerce.seller_risk_states%rowtype;
    v_velocity bigint;
    v_sales bigint;
    v_claims bigint;
    v_chargebacks bigint;
    v_claim_ratio integer;
    v_chargeback_ratio integer;
begin
    select * into v_order from commerce.orders where id = p_order_id;
    select * into v_terms from commerce.order_financial_terms where order_id = p_order_id;
    select * into v_risk from commerce.seller_risk_policies where id = v_terms.seller_risk_policy_id;
    if v_order.id is null or v_terms.order_id is null or v_risk.id is null then
        raise exception 'conflict: seller risk facts are unavailable';
    end if;
    perform pg_advisory_xact_lock(
        hashtextextended('commerce-seller-risk:' || v_order.seller_id::text, 0)
    );
    select * into v_state from commerce.refresh_seller_risk_state(v_order.seller_id);
    if v_state.status in ('restricted', 'blocked', 'manual_review')
        or v_state.outstanding_debt_amount > 0 then
        raise exception 'conflict: seller account is blocked by financial risk or debt';
    end if;
    select coalesce(sum(prior_terms.seller_proceeds_amount), 0)
    into v_velocity
    from commerce.order_financial_terms prior_terms
    join commerce.orders prior_order on prior_order.id = prior_terms.order_id
    where prior_order.seller_id = v_order.seller_id
      and (
          exists (
              select 1 from commerce.order_payment_attempts attempt
              where attempt.order_id = prior_order.id and attempt.status = 'succeeded'
                and attempt.succeeded_at >= now() - interval '24 hours'
          )
          or (prior_order.status = 'awaiting_payment' and prior_terms.pay_by_at > now())
          or exists (
              select 1 from commerce.order_payment_attempts attempt
              where attempt.order_id = prior_order.id
                and attempt.status in ('created', 'requires_action', 'processing')
          )
      );
    select coalesce(sum(prior_terms.buyer_total_amount), 0)
    into v_sales
    from commerce.order_financial_terms prior_terms
    join commerce.orders prior_order on prior_order.id = prior_terms.order_id
    where prior_order.seller_id = v_order.seller_id
      and exists (
          select 1 from commerce.order_payment_attempts attempt
          where attempt.order_id = prior_order.id and attempt.status = 'succeeded'
            and attempt.succeeded_at >= now() - interval '90 days'
      );
    select coalesce(sum(coalesce(claim.resolution_buyer_refund_amount, claim.buyer_requested_amount, 0)), 0)
    into v_claims
    from commerce.marketplace_claims claim
    join commerce.orders prior_order on prior_order.id = claim.order_id
    where prior_order.seller_id = v_order.seller_id
      and claim.created_at >= now() - interval '90 days'
      and claim.status <> 'resolved_seller';
    select coalesce(sum(dispute.amount), 0)
    into v_chargebacks
    from commerce.stripe_dispute_projections dispute
    join commerce.orders prior_order on prior_order.id = dispute.order_id
    where prior_order.seller_id = v_order.seller_id
      and dispute.opened_at >= now() - interval '90 days'
      and dispute.status not in ('won', 'prevented', 'warning_closed');
    v_claim_ratio := case when v_sales = 0
        then case when v_claims > 0 then 10000 else 0 end
        else least(10000, floor(v_claims::numeric * 10000 / v_sales)::integer) end;
    v_chargeback_ratio := case when v_sales = 0
        then case when v_chargebacks > 0 then 10000 else 0 end
        else least(10000, floor(v_chargebacks::numeric * 10000 / v_sales)::integer) end;
    if v_terms.seller_proceeds_amount > v_risk.order_transfer_limit_amount
        or v_terms.buyer_total_amount >= v_risk.high_value_review_amount then
        raise exception 'conflict: seller high-value risk review blocks %', p_stage;
    end if;
    if v_velocity > v_risk.velocity_limit_amount then
        raise exception 'conflict: seller velocity limit blocks %', p_stage;
    end if;
    if v_claims > 0 and v_claim_ratio >= v_risk.claim_ratio_review_bps then
        raise exception 'conflict: seller claim ratio blocks %', p_stage;
    end if;
    if v_chargebacks > 0 and v_chargeback_ratio >= v_risk.chargeback_ratio_review_bps then
        raise exception 'conflict: seller chargeback ratio blocks %', p_stage;
    end if;
end;
$$;