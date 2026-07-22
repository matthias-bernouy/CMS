

create or replace function commerce.lock_order_financial_terms(
    p_public_id uuid,
    p_buyer_cms_user_id text,
    p_delivery_quote_id text,
    p_shipping_amount bigint,
    p_currency text,
    p_expected_version integer,
    p_actor_id text default 'commerce-delivery'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_seller commerce.sellers%rowtype;
    v_settings commerce.settings%rowtype;
    v_fee commerce.fee_policies%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_risk commerce.seller_risk_policies%rowtype;
    v_buyer_component commerce.fee_policy_components%rowtype;
    v_seller_component commerce.fee_policy_components%rowtype;
    v_existing commerce.order_financial_terms%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_buyer_basis bigint;
    v_seller_basis bigint;
    v_buyer_fee bigint;
    v_seller_fee bigint;
    v_platform_shipping bigint;
    v_seller_shipping bigint;
    v_seller_proceeds bigint;
    v_seller_reserve bigint;
    v_platform_retained bigint;
    v_expected_margin bigint;
    v_subsidy commerce.financial_subsidy_overrides%rowtype;
    v_risk_state commerce.seller_risk_states%rowtype;
    v_recent_velocity_amount bigint;
    v_historical_sales_amount bigint;
    v_claim_exposure_amount bigint;
    v_chargeback_exposure_amount bigint;
    v_claim_ratio_bps integer;
    v_chargeback_ratio_bps integer;
    v_hash text;
begin
    if p_shipping_amount is null or p_shipping_amount < 0 or p_shipping_amount > 9007199254740991 then
        raise exception 'validation: trusted shipping amount is invalid';
    end if;
    if lower(p_currency) <> 'eur' then
        raise exception 'validation: protected C2C currently supports EUR only';
    end if;
    if p_delivery_quote_id is null or length(btrim(p_delivery_quote_id)) = 0 then
        raise exception 'validation: a trusted delivery quote id is required';
    end if;
    select * into v_order from commerce.orders
    where public_id = p_public_id and buyer_cms_user_id = p_buyer_cms_user_id
    for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_existing from commerce.order_financial_terms where order_id = v_order.id;
    if found then
        if v_existing.delivery_quote_id <> p_delivery_quote_id
            or v_existing.shipping_amount <> p_shipping_amount
            or v_existing.currency <> lower(p_currency) then
            raise exception 'conflict: locked financial terms do not match the trusted quote';
        end if;
        return to_jsonb(v_existing) || jsonb_build_object('idempotent_replay', true);
    end if;
    if v_order.status <> 'awaiting_quote' then
        raise exception 'conflict: order is not awaiting a delivery quote';
    end if;
    if v_order.version is distinct from p_expected_version then
        raise exception 'conflict: stale order version';
    end if;
    select * into v_seller from commerce.sellers where id = v_order.seller_id for update;
    if not found or v_seller.kind <> 'user' then
        raise exception 'conflict: protected payment requires a C2C user seller';
    end if;
    perform pg_advisory_xact_lock(
        hashtextextended('commerce-seller-risk:' || v_order.seller_id::text, 0)
    );
    select * into v_settings from commerce.settings where id = 'default' for share;
    select * into v_fee from commerce.fee_policies
    where id = v_settings.active_c2c_fee_policy_id and status = 'published';
    select * into v_protection from commerce.protection_policies
    where id = v_settings.active_c2c_protection_policy_id and status = 'published';
    select * into v_risk from commerce.seller_risk_policies
    where id = v_settings.active_c2c_seller_risk_policy_id and status = 'published';
    if v_fee.id is null or v_protection.id is null or v_risk.id is null then
        raise exception 'conflict: protected C2C policies are unavailable';
    end if;
    if v_fee.currency <> lower(p_currency) or v_protection.currency <> lower(p_currency)
        or v_risk.currency <> lower(p_currency) then
        raise exception 'conflict: policy currency does not match order currency';
    end if;
    select * into v_buyer_component from commerce.fee_policy_components
    where fee_policy_id = v_fee.id and component_key = 'buyer_protection';
    select * into v_seller_component from commerce.fee_policy_components
    where fee_policy_id = v_fee.id and component_key = 'seller_commission';
    if v_buyer_component.id is null or v_seller_component.id is null then
        raise exception 'conflict: fee policy components are incomplete';
    end if;
    v_platform_shipping := case when v_fee.shipping_beneficiary = 'platform' then p_shipping_amount else 0 end;
    v_seller_shipping := p_shipping_amount - v_platform_shipping;
    v_buyer_basis := v_order.subtotal_amount + case
        when v_buyer_component.basis = 'merchandise_and_shipping' then p_shipping_amount else 0 end;
    v_seller_basis := v_order.subtotal_amount + case
        when v_seller_component.basis = 'merchandise_and_shipping' then p_shipping_amount else 0 end;
    v_buyer_fee := commerce.round_half_up_fee(
        v_buyer_basis, v_buyer_component.rate_bps, v_buyer_component.fixed_amount,
        v_buyer_component.minimum_amount, v_buyer_component.maximum_amount
    );
    v_seller_fee := commerce.round_half_up_fee(
        v_seller_basis, v_seller_component.rate_bps, v_seller_component.fixed_amount,
        v_seller_component.minimum_amount, v_seller_component.maximum_amount
    );
    if v_seller_fee >= v_order.subtotal_amount + v_seller_shipping then
        raise exception 'validation: seller commission must remain below seller gross entitlement';
    end if;
    v_seller_proceeds := v_order.subtotal_amount + v_seller_shipping - v_seller_fee;
    v_seller_reserve := least(
        greatest(0, v_seller_proceeds - 1),
        floor((v_seller_proceeds::numeric * v_risk.reserve_rate_bps + 5000) / 10000)::bigint
    );
    v_platform_retained := v_buyer_fee + v_seller_fee + v_platform_shipping;
    v_expected_margin := v_platform_retained - v_fee.estimated_stripe_cost_amount
        - v_fee.estimated_carrier_cost_amount - v_fee.platform_risk_reserve_contribution_amount;
    if not v_fee.cost_estimates_configured or v_expected_margin < v_fee.configured_minimum_margin_amount then
        select * into v_subsidy from commerce.financial_subsidy_overrides
        where fee_policy_id = v_fee.id
          and (expires_at is null or expires_at > now())
          and maximum_deficit_amount >= greatest(0, v_fee.configured_minimum_margin_amount - v_expected_margin)
        order by created_at desc limit 1;
        if not found then
            raise exception 'conflict: protected order margin is below policy minimum without subsidy approval';
        end if;
    end if;
    select * into v_risk_state from commerce.refresh_seller_risk_state(v_order.seller_id);
    if v_risk_state.status in ('restricted', 'blocked', 'manual_review')
        or v_risk_state.outstanding_debt_amount > 0 then
        raise exception 'conflict: seller account is blocked by financial risk or debt';
    end if;
    select coalesce(sum(terms.seller_proceeds_amount), 0)
    into v_recent_velocity_amount
    from commerce.order_financial_terms terms
    join commerce.orders prior_order on prior_order.id = terms.order_id
    where prior_order.seller_id = v_order.seller_id
      and (
          exists (
              select 1 from commerce.order_payment_attempts attempt
              where attempt.order_id = prior_order.id and attempt.status = 'succeeded'
                and attempt.succeeded_at >= now() - interval '24 hours'
          )
          or (prior_order.status = 'awaiting_payment' and terms.pay_by_at > now())
          or exists (
              select 1 from commerce.order_payment_attempts attempt
              where attempt.order_id = prior_order.id
                and attempt.status in ('created', 'requires_action', 'processing')
          )
      );
    select coalesce(sum(terms.buyer_total_amount), 0)
    into v_historical_sales_amount
    from commerce.order_financial_terms terms
    join commerce.orders prior_order on prior_order.id = terms.order_id
    join commerce.order_payment_attempts attempt on attempt.order_id = prior_order.id
    where prior_order.seller_id = v_order.seller_id
      and attempt.status = 'succeeded'
      and attempt.succeeded_at >= now() - interval '90 days';
    select coalesce(sum(coalesce(claim.resolution_buyer_refund_amount, claim.buyer_requested_amount, 0)), 0)
    into v_claim_exposure_amount
    from commerce.marketplace_claims claim
    join commerce.orders prior_order on prior_order.id = claim.order_id
    where prior_order.seller_id = v_order.seller_id
      and claim.created_at >= now() - interval '90 days'
      and claim.status not in ('resolved_seller');
    select coalesce(sum(dispute.amount), 0)
    into v_chargeback_exposure_amount
    from commerce.stripe_dispute_projections dispute
    join commerce.orders prior_order on prior_order.id = dispute.order_id
    where prior_order.seller_id = v_order.seller_id
      and dispute.opened_at >= now() - interval '90 days'
      and dispute.status not in ('won', 'prevented', 'warning_closed');
    v_claim_ratio_bps := case when v_historical_sales_amount = 0
        then case when v_claim_exposure_amount > 0 then 10000 else 0 end
        else least(10000, floor(v_claim_exposure_amount::numeric * 10000 / v_historical_sales_amount)::integer) end;
    v_chargeback_ratio_bps := case when v_historical_sales_amount = 0
        then case when v_chargeback_exposure_amount > 0 then 10000 else 0 end
        else least(10000, floor(v_chargeback_exposure_amount::numeric * 10000 / v_historical_sales_amount)::integer) end;
    if v_seller_proceeds > v_risk.order_transfer_limit_amount
        or v_order.subtotal_amount + p_shipping_amount + v_buyer_fee
            >= v_risk.high_value_review_amount then
        raise exception 'conflict: seller risk policy requires manual review before payment';
    end if;
    if v_recent_velocity_amount + v_seller_proceeds > v_risk.velocity_limit_amount then
        raise exception 'conflict: seller velocity limit requires manual review before payment';
    end if;
    if v_claim_exposure_amount > 0 and v_claim_ratio_bps >= v_risk.claim_ratio_review_bps then
        raise exception 'conflict: seller claim ratio requires manual review before payment';
    end if;
    if v_chargeback_exposure_amount > 0
        and v_chargeback_ratio_bps >= v_risk.chargeback_ratio_review_bps then
        raise exception 'conflict: seller chargeback ratio requires manual review before payment';
    end if;
    v_hash := encode(extensions.digest(jsonb_build_object(
        'orderPublicId', v_order.public_id,
        'buyerCmsUserId', v_order.buyer_cms_user_id,
        'sellerId', v_order.seller_id,
        'deliveryQuoteId', p_delivery_quote_id,
        'feePolicyId', v_fee.id,
        'protectionPolicyId', v_protection.id,
        'sellerRiskPolicyId', v_risk.id,
        'merchandiseSubtotalAmount', v_order.subtotal_amount,
        'shippingAmount', p_shipping_amount,
        'buyerProtectionFeeAmount', v_buyer_fee,
        'sellerCommissionAmount', v_seller_fee,
        'sellerProceedsAmount', v_seller_proceeds,
        'currency', lower(p_currency)
    )::text, 'sha256'), 'hex');
    insert into commerce.order_financial_terms (
        order_id, fee_policy_id, fee_policy_version, fee_policy_snapshot,
        protection_policy_id, protection_policy_version, protection_policy_snapshot,
        seller_risk_policy_id, seller_risk_policy_version, seller_risk_policy_snapshot,
        delivery_quote_id, merchandise_subtotal_amount, shipping_amount,
        buyer_protection_fee_amount, seller_commission_amount,
        platform_shipping_share_amount, seller_shipping_share_amount,
        buyer_total_amount, seller_proceeds_amount, seller_transfer_release_amount,
        seller_reserve_liability_amount, platform_retained_amount,
        estimated_stripe_cost_amount, estimated_carrier_cost_amount,
        platform_risk_reserve_contribution_amount, configured_minimum_margin_amount,
        expected_platform_margin_amount, subsidy_override_id, currency,
        financial_terms_hash, pricing_locked_at, pay_by_at
    ) values (
        v_order.id, v_fee.id, v_fee.version,
        to_jsonb(v_fee) || jsonb_build_object('components', (
            select jsonb_agg(to_jsonb(component) order by component.position, component.id)
            from commerce.fee_policy_components component where component.fee_policy_id = v_fee.id
        )),
        v_protection.id, v_protection.version, to_jsonb(v_protection),
        v_risk.id, v_risk.version, to_jsonb(v_risk),
        p_delivery_quote_id, v_order.subtotal_amount, p_shipping_amount,
        v_buyer_fee, v_seller_fee, v_platform_shipping, v_seller_shipping,
        v_order.subtotal_amount + p_shipping_amount + v_buyer_fee,
        v_seller_proceeds, v_seller_proceeds - v_seller_reserve, v_seller_reserve,
        v_platform_retained, v_fee.estimated_stripe_cost_amount,
        v_fee.estimated_carrier_cost_amount, v_fee.platform_risk_reserve_contribution_amount,
        v_fee.configured_minimum_margin_amount, v_expected_margin, v_subsidy.id,
        lower(p_currency), v_hash, now(), now() + make_interval(mins => v_protection.payment_window_minutes)
    ) returning * into v_terms;
    insert into commerce.order_fulfillments (
        order_id, seller_handoff_deadline, scan_grace_deadline
    ) values (
        v_order.id,
        now() + make_interval(hours => v_protection.seller_handoff_hours),
        now() + make_interval(hours => v_protection.seller_handoff_hours + v_protection.scan_grace_hours)
    );
    insert into commerce.order_settlements (
        order_id, authorized_seller_amount, seller_reserve_liability_remaining_amount,
        platform_gross_remainder_amount
    ) values (
        v_order.id, v_terms.seller_proceeds_amount,
        v_terms.seller_reserve_liability_amount, v_terms.platform_retained_amount
    );
    if v_terms.seller_reserve_liability_amount > 0 then
        perform commerce.record_seller_financial_exposure(
            v_order.id, 'reserve:' || v_order.id, 'reserve', 'held',
            v_terms.seller_reserve_liability_amount, 0,
            'Versioned seller rolling reserve',
            jsonb_build_object('sellerRiskPolicyId', v_terms.seller_risk_policy_id,
                'releaseAfter', now() + make_interval(days => v_risk.reserve_liability_days))
        );
    end if;
    update commerce.orders set
        status = 'awaiting_payment', shipping_amount = p_shipping_amount,
        delivery_quoted_at = now(), total_amount = v_terms.buyer_total_amount
    where id = v_order.id;
    perform commerce.append_financial_event(
        v_order.id, 'order', v_order.id::text, 'financial_terms_locked',
        'system', coalesce(nullif(p_actor_id, ''), 'commerce-delivery'), null,
        jsonb_build_object('financialTermsHash', v_hash, 'deliveryQuoteId', p_delivery_quote_id),
        'commerce.order.financial_terms_locked', 'order:' || v_order.id || ':financial-terms:' || v_hash
    );
    return to_jsonb(v_terms) || jsonb_build_object('idempotent_replay', false);
end;
$$;