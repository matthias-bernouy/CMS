\set ON_ERROR_STOP on

begin;
set local role service_role;

select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Platform liability smoke policy',
        'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 50,
        'estimatedCarrierCostAmount', 100,
        'platformRiskReserveContributionAmount', 50,
        'configuredMinimumMarginAmount', 100,
        'buyerFeeFixedAmount', 500,
        'sellerFeeRateBps', 500,
        'sellerReserveRateBps', 1000,
        'payoutDelayDays', 14,
        'reserveLiabilityDays', 120,
        'highValueReviewAmount', 500000,
        'claimRatioReviewBps', 10000
    ),
    'platform-liability-smoke-admin',
    (select version from commerce.settings where id = 'default')
);

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name,
    verification_status, verified_at, verified_by
) values (
    'user', 'platform-liability-seller', 'platform-liability-seller',
    'Platform liability seller', 'verified', now(), 'smoke-admin'
) returning id as seller_id \gset

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'platform-liability-buyer-1', 'platform-liability-checkout-1',
    left(encode(extensions.digest('platform-liability-checkout-1', 'sha256'), 'hex'), 32)
) returning id as checkout_group_id_1 \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'PLATFORM-LIABILITY-1', :'checkout_group_id_1', :seller_id,
    'platform-liability-buyer-1', 'eur', 10000, 10000,
    'platform-liability-checkout-1',
    left(encode(extensions.digest('platform-liability-checkout-1', 'sha256'), 'hex'), 32)
) returning id as order_id_1, public_id as order_public_id_1,
    version as order_version_1 \gset

select result->>'financial_terms_hash' as terms_hash_1,
    (result->>'buyer_total_amount')::bigint as buyer_total_1
from (select commerce.lock_order_financial_terms(
    :'order_public_id_1', 'platform-liability-buyer-1',
    'platform-liability-quote-1', 0, 'eur', :order_version_1, 'delivery-smoke'
) result) locked \gset

do $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_control jsonb;
    v_receipt jsonb;
    v_overcovered_amount bigint;
begin
    select * into v_order from commerce.orders where order_number = 'PLATFORM-LIABILITY-1';
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    v_control := commerce.prepare_protected_payment(v_order.id, v_order.buyer_cms_user_id);
    if (v_control->>'platformRequiredMinimumBalanceAmount')::bigint
            <> v_terms.seller_proceeds_amount + v_terms.platform_risk_reserve_contribution_amount
        or (v_control->>'platformLiabilityRevision')::bigint <> 1
        or v_control->>'platformPayoutChangeDirection' <> 'increase' then
        raise exception 'smoke: prospective Commerce liability aggregate is not exact';
    end if;
    v_overcovered_amount := (v_control->>'platformRequiredMinimumBalanceAmount')::bigint + 980;
    v_receipt := commerce.record_platform_payout_liability_applied(
        (v_control->>'platformLiabilityRevision')::bigint,
        v_overcovered_amount,
        null
    );
    if (v_receipt->>'accepted')::boolean is not true
        or (v_receipt->>'lastProviderAppliedAmount')::bigint <> v_overcovered_amount then
        raise exception 'smoke: safe provider overcoverage was not retained by Commerce';
    end if;
end;
$$;

select commerce.record_order_payment_projection(
    :'order_public_id_1', 'platform-liability-payment-1', 9701, 'succeeded',
    :buyer_total_1, 'eur', :'terms_hash_1', now(), '{}',
    'ch_platform_liability_1', 'pi_platform_liability_1'
);

update commerce.order_settlements set
    status = 'released',
    total_transferred_amount = authorized_seller_amount,
    seller_reserve_liability_remaining_amount = 0
where order_id = :order_id_1;

do $$
declare
    v_order_id bigint;
    v_terms commerce.order_financial_terms%rowtype;
    v_control commerce.platform_payout_liability_controls%rowtype;
    v_pending jsonb;
begin
    select id into v_order_id from commerce.orders where order_number = 'PLATFORM-LIABILITY-1';
    select * into v_terms from commerce.order_financial_terms where order_id = v_order_id;
    select * into v_control from commerce.platform_payout_liability_controls where control_key = 'default';
    if v_control.required_minimum_amount <> v_terms.platform_risk_reserve_contribution_amount
        or v_control.change_direction <> 'decrease'
        or v_control.decrease_authorization_id is not null then
        raise exception 'smoke: risk reserve did not remain held after seller release';
    end if;
    v_pending := commerce.pending_platform_payout_liability_authorizations('risk-still-held');
    if jsonb_array_length(v_pending->'authorizations') <> 0 then
        raise exception 'smoke: an unauthorized decrease became provider executable';
    end if;
end;
$$;

update commerce.platform_payout_order_liabilities set
    risk_release_at = now() - interval '1 second'
where order_id = :order_id_1;

insert into commerce.stripe_dispute_projections (
    order_id, provider_dispute_id, status, reason, amount, currency,
    funds_withdrawn, provider_snapshot, opened_at, closed_at
) values (
    :order_id_1, 'dp-platform-liability-smoke', 'won', 'fraudulent',
    :buyer_total_1, 'eur', true, '{"fundsWithdrawn":true}'::jsonb,
    now() - interval '1 day', null
);

do $$
declare
    v_terms commerce.order_financial_terms%rowtype;
    v_control jsonb;
begin
    select terms.* into v_terms
    from commerce.order_financial_terms terms
    join commerce.orders order_row on order_row.id = terms.order_id
    where order_row.order_number = 'PLATFORM-LIABILITY-1';
    v_control := commerce.refresh_platform_payout_liability(
        'Terminal dispute still has withdrawn funds', null
    );
    if (v_control->>'requiredMinimumAmount')::bigint
            <> v_terms.platform_risk_reserve_contribution_amount then
        raise exception 'smoke: terminal dispute released risk reserve while funds remained withdrawn';
    end if;
end;
$$;

update commerce.stripe_dispute_projections set
    funds_withdrawn = false,
    closed_at = now(),
    provider_snapshot = '{"fundsWithdrawn":false}'::jsonb
where provider_dispute_id = 'dp-platform-liability-smoke';

do $$
declare
    v_control jsonb;
    v_authorized jsonb;
    v_revision bigint;
    v_previous_provider_amount bigint;
    v_persisted commerce.platform_payout_liability_controls%rowtype;
begin
    v_control := commerce.refresh_platform_payout_liability(
        'Smoke terminal risk-window expiry', null
    );
    if (v_control->>'requiredMinimumAmount')::bigint <> 0
        or v_control->>'changeDirection' <> 'decrease' then
        raise exception 'smoke: expired risk reserve did not produce a pending decrease';
    end if;
    v_revision := (v_control->>'liabilityRevision')::bigint;
    begin
        perform commerce.authorize_platform_payout_liability_decrease(
            v_revision - 1, 'admin-stale', 'stale decrease must fail'
        );
        raise exception 'smoke: stale Admin decrease revision was accepted';
    exception when others then
        if sqlerrm = 'smoke: stale Admin decrease revision was accepted'
            or sqlerrm <> 'conflict: stale platform payout liability revision' then raise; end if;
    end;
    v_authorized := commerce.authorize_platform_payout_liability_decrease(
        v_revision, 'admin-current', 'terminal risk window expired'
    );
    if nullif(v_authorized->>'decreaseAuthorizationId', '') is null then
        raise exception 'smoke: exact Admin decrease authorization was not persisted';
    end if;
    v_previous_provider_amount := (v_authorized->>'lastProviderAppliedAmount')::bigint;
    begin
        perform commerce.record_platform_payout_liability_applied(
            v_revision,
            v_previous_provider_amount,
            (v_authorized->>'decreaseAuthorizationId')::uuid
        );
        raise exception 'smoke: overcovered receipt consumed an exact Admin decrease authorization';
    exception when others then
        if sqlerrm = 'smoke: overcovered receipt consumed an exact Admin decrease authorization'
            or sqlerrm <> 'conflict: Admin-authorized provider decrease must match the exact Commerce aggregate'
        then raise; end if;
    end;
    select * into v_persisted
    from commerce.platform_payout_liability_controls
    where control_key = 'default';
    if v_persisted.decrease_authorization_id::text
        is distinct from v_authorized->>'decreaseAuthorizationId' then
        raise exception 'smoke: rejected overcoverage consumed the Admin decrease authorization';
    end if;
end;
$$;

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'platform-liability-buyer-2', 'platform-liability-checkout-2',
    left(encode(extensions.digest('platform-liability-checkout-2', 'sha256'), 'hex'), 32)
) returning id as checkout_group_id_2 \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'PLATFORM-LIABILITY-2', :'checkout_group_id_2', :seller_id,
    'platform-liability-buyer-2', 'eur', 20000, 20000,
    'platform-liability-checkout-2',
    left(encode(extensions.digest('platform-liability-checkout-2', 'sha256'), 'hex'), 32)
) returning id as order_id_2, public_id as order_public_id_2,
    version as order_version_2 \gset

select commerce.lock_order_financial_terms(
    :'order_public_id_2', 'platform-liability-buyer-2',
    'platform-liability-quote-2', 0, 'eur', :order_version_2, 'delivery-smoke'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_before commerce.platform_payout_liability_controls%rowtype;
    v_after jsonb;
    v_old_receipt jsonb;
    v_pending jsonb;
begin
    select * into v_before from commerce.platform_payout_liability_controls where control_key = 'default';
    select * into v_order from commerce.orders where order_number = 'PLATFORM-LIABILITY-2';
    v_after := commerce.prepare_protected_payment(v_order.id, v_order.buyer_cms_user_id);
    if (v_after->>'platformPayoutChangeDirection') <> 'increase'
        or (v_after->>'platformLiabilityRevision')::bigint <= v_before.liability_revision
        or nullif(v_after->>'platformPayoutDecreaseAuthorizationId', '') is not null then
        raise exception 'smoke: newer liability did not supersede the pending decrease';
    end if;
    v_old_receipt := commerce.record_platform_payout_liability_applied(
        v_before.liability_revision, 0, v_before.decrease_authorization_id
    );
    if (v_old_receipt->>'accepted')::boolean is not false
        or (v_old_receipt->>'needsReapply')::boolean is not true then
        raise exception 'smoke: stale provider receipt did not yield to the newer revision';
    end if;
    v_pending := commerce.pending_platform_payout_liability_authorizations('new-liability-wins');
    if jsonb_array_length(v_pending->'authorizations') <> 1
        or (v_pending->'authorizations'->0->>'liabilityRevision')::bigint
            <> (v_after->>'platformLiabilityRevision')::bigint then
        raise exception 'smoke: newer aggregate was not re-applicable';
    end if;
end;
$$;

rollback;
