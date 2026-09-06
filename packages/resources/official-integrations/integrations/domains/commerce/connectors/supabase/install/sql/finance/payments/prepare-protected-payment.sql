

drop function if exists commerce.prepare_protected_payment(bigint, text);
drop function if exists commerce.prepare_protected_payment(bigint, text, uuid[], text, uuid);
drop function if exists commerce.prepare_protected_payment(bigint, text, uuid[], text, uuid, jsonb);

create or replace function commerce.prepare_protected_payment(
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_payment_provider text default 'stripe',
    p_correlation_id uuid default gen_random_uuid(),
    p_consent_receipts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_attempt commerce.order_payment_attempts%rowtype;
    v_seller commerce.sellers%rowtype;
    v_risk commerce.seller_risk_policies%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_seller_required_minimum_balance bigint;
    v_platform_required_minimum_balance bigint;
    v_platform_control jsonb;
    v_legal_acceptances jsonb;
begin
    select * into v_order from commerce.orders
    where id = p_order_id and buyer_cms_user_id = p_buyer_cms_user_id;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    if not found then raise exception 'conflict: immutable financial terms are not locked'; end if;
    if v_order.status not in ('awaiting_payment', 'active') then
        raise exception 'conflict: order cannot enter protected payment';
    end if;
    if v_order.status = 'awaiting_payment' and now() >= v_terms.pay_by_at then
        raise exception 'conflict: protected payment window has expired';
    end if;
    if p_payment_provider is null
        or p_payment_provider !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: payment provider is invalid';
    end if;
    insert into commerce.order_payment_attempts (
        order_id,
        provider,
        client_reference_id,
        status,
        amount,
        currency,
        financial_terms_hash
    ) values (
        v_order.id,
        p_payment_provider,
        v_order.public_id::text,
        'created',
        v_terms.buyer_total_amount,
        v_terms.currency,
        v_terms.financial_terms_hash
    ) on conflict (provider, client_reference_id) do nothing;
    select * into strict v_attempt
    from commerce.order_payment_attempts
    where provider = p_payment_provider
      and client_reference_id = v_order.public_id::text
    for update;
    if v_attempt.order_id <> v_order.id
        or v_attempt.amount <> v_terms.buyer_total_amount
        or v_attempt.currency <> v_terms.currency
        or v_attempt.financial_terms_hash <> v_terms.financial_terms_hash then
        raise exception 'conflict: payment attempt does not match immutable financial terms';
    end if;
    v_legal_acceptances := commerce.record_verified_order_consent(
        v_order.id,
        v_attempt.id,
        v_order.buyer_cms_user_id,
        p_correlation_id,
        p_consent_receipts
    );
    perform commerce.assert_order_seller_risk(v_order.id, 'payment preparation');
    select * into v_seller from commerce.sellers where id = v_order.seller_id;
    select * into v_risk from commerce.seller_risk_policies where id = v_terms.seller_risk_policy_id;
    select * into v_protection from commerce.protection_policies where id = v_terms.protection_policy_id;
    if v_seller.kind <> 'user' or v_seller.cms_user_id is null then
        raise exception 'conflict: protected payment requires a C2C user seller';
    end if;
    select coalesce(state.outstanding_debt_amount + state.at_risk_exposure_amount, 0)
    into v_seller_required_minimum_balance
    from commerce.seller_risk_states state
    where state.seller_id = v_order.seller_id;
    insert into commerce.platform_payout_order_liabilities (
        order_id, lifecycle_status, risk_release_at
    ) values (
        v_order.id, 'provisional', null
    ) on conflict (order_id) do update set
        lifecycle_status = case
            when commerce.platform_payout_order_liabilities.lifecycle_status = 'active'
                then 'active'
            else 'provisional' end,
        risk_release_at = case
            when commerce.platform_payout_order_liabilities.lifecycle_status = 'active'
                then commerce.platform_payout_order_liabilities.risk_release_at
            else null end,
        updated_at = now();
    v_platform_control := commerce.refresh_platform_payout_liability_delta(
        array[v_order.id],
        'Protected payment preparation reserved prospective liability', v_order.id
    );
    v_platform_required_minimum_balance := (v_platform_control->>'requiredMinimumAmount')::bigint;
    return jsonb_build_object(
        'orderId', v_order.id,
        'orderPublicId', v_order.public_id,
        'orderNumber', v_order.order_number,
        'buyerCmsUserId', v_order.buyer_cms_user_id,
        'sellerId', v_seller.cms_user_id,
        'currency', upper(v_terms.currency),
        'deliveryQuoteId', v_terms.delivery_quote_id,
        'merchandiseSubtotalMinorAmount', v_terms.merchandise_subtotal_amount,
        'shippingAmount', v_terms.shipping_amount,
        'buyerTotalAmount', v_terms.buyer_total_amount,
        'sellerProceedsAmount', v_terms.seller_proceeds_amount,
        'sellerTransferReleaseAmount', v_terms.seller_transfer_release_amount,
        'sellerReserveLiabilityAmount', v_terms.seller_reserve_liability_amount,
        'payoutDelayDays', v_risk.payout_delay_days,
        'sellerReserveLiabilityDays', v_risk.reserve_liability_days,
        'dualApprovalThresholdAmount', v_protection.dual_approval_threshold_amount,
        'sellerRequiredMinimumBalanceAmount', v_seller_required_minimum_balance,
        'platformRequiredMinimumBalanceAmount', v_platform_required_minimum_balance,
        'platformLiabilityRevision', (v_platform_control->>'liabilityRevision')::bigint,
        'platformPayoutDecreaseAuthorizationId', v_platform_control->>'decreaseAuthorizationId',
        'platformPayoutChangeDirection', v_platform_control->>'changeDirection',
        'platformRetainedAmount', v_terms.platform_retained_amount,
        'financialTermsHash', v_terms.financial_terms_hash,
        'financialRevision', v_terms.financial_revision,
        'paymentAttemptId', v_attempt.id,
        'buyerLegalAcceptances', v_legal_acceptances,
        'payByAt', v_terms.pay_by_at,
        'protectionRequired', true
    );
end;
$$;
