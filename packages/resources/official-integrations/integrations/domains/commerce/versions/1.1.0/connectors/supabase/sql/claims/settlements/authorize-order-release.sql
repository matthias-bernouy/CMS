

create or replace function commerce.authorize_order_release(
    p_order_id bigint,
    p_actor_kind text,
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
    v_risk commerce.seller_risk_policies%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_payment commerce.order_payment_attempts%rowtype;
    v_authorization commerce.settlement_release_authorizations%rowtype;
    v_seller_required_minimum_balance bigint;
begin
    if p_actor_kind is null or p_actor_kind not in ('admin', 'system') then
        raise exception 'forbidden: release actor is not allowed';
    end if;
    select * into v_order from commerce.orders where id = p_order_id;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id for update;
    if v_settlement.version is distinct from p_expected_settlement_version then
        raise exception 'conflict: stale settlement version';
    end if;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    perform commerce.assert_order_seller_risk(v_order.id, 'settlement release');
    select * into v_seller from commerce.sellers where id = v_order.seller_id;
    select * into v_risk from commerce.seller_risk_policies where id = v_terms.seller_risk_policy_id;
    select coalesce(state.outstanding_debt_amount + state.at_risk_exposure_amount, 0)
    into v_seller_required_minimum_balance
    from commerce.seller_risk_states state
    where state.seller_id = v_order.seller_id;
    select * into v_fulfillment from commerce.order_fulfillments where order_id = v_order.id;
    select * into v_payment from commerce.order_payment_attempts
    where order_id = v_order.id and status = 'succeeded' order by created_at desc limit 1;
    if v_payment.id is null then raise exception 'conflict: release requires confirmed payment'; end if;
    if not exists (
        select 1 from commerce.delivery_reconciliation_health health
        where health.id = 'mondial-relay'
          and health.checked_at >= now() - interval '30 minutes'
    ) then
        raise exception 'conflict: fresh Delivery reconciliation heartbeat is required for release';
    end if;
    if not exists (
        select 1 from commerce.delivery_order_reconciliation_health health
        where health.order_id = v_order.id
          and health.checked_at >= now() - interval '30 minutes'
          and health.shipment_id <> ''
          and health.provider_reference = v_fulfillment.provider_reference
          and health.shipment_status = 'collected_by_recipient'
          and health.pending_projection_count = 0
          and health.manual_review_count = 0
          and health.tracking_error_count = 0
          and health.tracking_checked_at is not null
    ) then
        raise exception 'conflict: fresh healthy Delivery reconciliation for this order is required for release';
    end if;
    if v_fulfillment.status <> 'collected_by_recipient' or v_fulfillment.recipient_handoff_at is null
        or v_fulfillment.release_eligible_at is null or now() < v_fulfillment.release_eligible_at then
        raise exception 'conflict: recipient handoff claim window has not expired';
    end if;
    if exists (select 1 from commerce.marketplace_claims where order_id = v_order.id
        and status not in ('resolved_buyer', 'resolved_seller', 'resolved_split')) then
        raise exception 'conflict: open marketplace claim blocks release';
    end if;
    if exists (select 1 from commerce.refund_requests where order_id = v_order.id
        and status not in ('rejected', 'cancelled', 'failed', 'succeeded')) then
        raise exception 'conflict: refund request blocks release';
    end if;
    if exists (select 1 from commerce.stripe_dispute_projections where order_id = v_order.id
        and status not in ('won', 'prevented', 'warning_closed')) then
        raise exception 'conflict: Stripe dispute blocks release';
    end if;
    if v_fulfillment.blocking_reason is not null or v_settlement.status in (
        'release_pending', 'reserve_held', 'released', 'refund_pending',
        'refunded', 'reversal_pending', 'reversed', 'manual_review'
    ) then
        raise exception 'conflict: settlement is blocked';
    end if;
    insert into commerce.settlement_release_authorizations (
        order_id, business_key, release_kind, authorized_amount, currency, financial_terms_hash,
        authorized_by_kind, authorized_by, reason
    ) values (
        v_order.id, 'settlement:' || v_order.id || ':initial:' || v_terms.financial_terms_hash,
        'initial', v_settlement.authorized_seller_amount
            - v_settlement.seller_reserve_liability_remaining_amount,
        v_terms.currency, v_terms.financial_terms_hash,
        p_actor_kind, p_actor_id, p_reason
    ) on conflict (business_key) do update set order_id = excluded.order_id
    returning * into v_authorization;
    update commerce.order_settlements set status = 'release_pending', manual_review_reason = null
    where order_id = v_order.id;
    perform commerce.append_financial_event(
        v_order.id, 'release_authorization', v_authorization.id::text, 'settlement_release_authorized',
        p_actor_kind, p_actor_id, p_reason,
        jsonb_build_object('authorizedAmount', v_authorization.authorized_amount),
        'commerce.settlement.release_authorized', 'release:' || v_authorization.id || ':authorized'
    );
    return jsonb_build_object(
        'status', 'authorized',
        'releaseAuthorizationId', v_authorization.id,
        'orderId', v_order.id,
        'orderPublicId', v_order.public_id,
        'paymentId', v_payment.provider_payment_id,
        'businessKey', v_authorization.business_key,
        'sellerId', v_seller.cms_user_id,
        'sellerRequiredMinimumBalanceAmount', v_seller_required_minimum_balance,
        'payoutDelayDays', v_risk.payout_delay_days,
        'amount', v_authorization.authorized_amount,
        'authorizedSellerTransferAmount', v_authorization.authorized_amount,
        'releaseKind', v_authorization.release_kind,
        'currency', upper(v_authorization.currency),
        'financialTermsHash', v_authorization.financial_terms_hash
    );
end;
$$;