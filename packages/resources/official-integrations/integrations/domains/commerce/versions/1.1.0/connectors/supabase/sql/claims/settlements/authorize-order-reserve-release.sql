

create or replace function commerce.authorize_order_reserve_release(
    p_order_id bigint,
    p_actor_id text,
    p_reason text,
    p_expected_settlement_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_seller commerce.sellers%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_risk commerce.seller_risk_policies%rowtype;
    v_payment commerce.order_payment_attempts%rowtype;
    v_authorization commerce.settlement_release_authorizations%rowtype;
    v_seller_required_minimum_balance bigint;
begin
    select * into v_order from commerce.orders where id = p_order_id;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_settlement from commerce.order_settlements
    where order_id = p_order_id for update;
    if v_settlement.version is distinct from p_expected_settlement_version then
        raise exception 'conflict: stale settlement version';
    end if;
    select * into v_terms from commerce.order_financial_terms where order_id = p_order_id;
    select * into v_seller from commerce.sellers where id = v_order.seller_id;
    select * into v_risk from commerce.seller_risk_policies where id = v_terms.seller_risk_policy_id;
    select * into v_fulfillment from commerce.order_fulfillments where order_id = p_order_id;
    select * into v_payment from commerce.order_payment_attempts
    where order_id = p_order_id and status = 'succeeded' order by created_at desc limit 1;
    perform commerce.assert_order_seller_risk(p_order_id, 'seller reserve release');
    select coalesce(state.outstanding_debt_amount + state.at_risk_exposure_amount, 0)
    into v_seller_required_minimum_balance
    from commerce.seller_risk_states state
    where state.seller_id = v_order.seller_id;
    if v_settlement.seller_reserve_liability_remaining_amount <= 0 then
        raise exception 'conflict: seller reserve has no releasable balance';
    end if;
    if v_settlement.total_transferred_amount - v_settlement.total_reversed_amount
        < v_settlement.authorized_seller_amount
            - v_settlement.seller_reserve_liability_remaining_amount then
        raise exception 'conflict: initial seller release is not confirmed';
    end if;
    if v_fulfillment.release_eligible_at is null
        or now() < v_fulfillment.release_eligible_at + make_interval(days => v_risk.reserve_liability_days) then
        raise exception 'conflict: seller reserve holding period has not expired';
    end if;
    if exists (select 1 from commerce.marketplace_claims where order_id = p_order_id
        and status not in ('resolved_buyer', 'resolved_seller', 'resolved_split'))
        or exists (select 1 from commerce.refund_requests where order_id = p_order_id
            and status not in ('rejected', 'cancelled', 'failed', 'succeeded'))
        or exists (select 1 from commerce.stripe_dispute_projections where order_id = p_order_id
            and status not in ('won', 'prevented', 'warning_closed')) then
        raise exception 'conflict: an open financial incident blocks seller reserve release';
    end if;
    insert into commerce.settlement_release_authorizations (
        order_id, business_key, release_kind, authorized_amount, currency,
        financial_terms_hash, authorized_by_kind, authorized_by, reason
    ) values (
        p_order_id, 'settlement:' || p_order_id || ':reserve:' || v_terms.financial_terms_hash,
        'reserve', v_settlement.seller_reserve_liability_remaining_amount,
        v_terms.currency, v_terms.financial_terms_hash, 'system', p_actor_id, p_reason
    ) on conflict (business_key) do update set order_id = excluded.order_id
    returning * into v_authorization;
    update commerce.order_settlements set status = 'release_pending', manual_review_reason = null
    where order_id = p_order_id;
    perform commerce.append_financial_event(
        p_order_id, 'release_authorization', v_authorization.id::text,
        'seller_reserve_release_authorized', 'system', p_actor_id, p_reason,
        jsonb_build_object('authorizedAmount', v_authorization.authorized_amount),
        'commerce.settlement.reserve_release_authorized',
        'release:' || v_authorization.id || ':authorized'
    );
    return jsonb_build_object(
        'status', 'authorized', 'releaseAuthorizationId', v_authorization.id,
        'releaseKind', 'reserve', 'orderId', p_order_id,
        'orderPublicId', v_order.public_id, 'paymentId', v_payment.provider_payment_id,
        'businessKey', v_authorization.business_key,
        'sellerId', v_seller.cms_user_id,
        'sellerRequiredMinimumBalanceAmount', v_seller_required_minimum_balance,
        'payoutDelayDays', v_risk.payout_delay_days,
        'amount', v_authorization.authorized_amount,
        'authorizedSellerTransferAmount', v_authorization.authorized_amount,
        'currency', upper(v_authorization.currency),
        'financialTermsHash', v_authorization.financial_terms_hash
    );
end;
$$;