create or replace function pg_temp.assert_carrier_truth(
    p_condition boolean,
    p_message text
)
returns void
language plpgsql
as $$
begin
    if not coalesce(p_condition, false) then
        raise exception 'fulfillment truth contract: %', p_message;
    end if;
end;
$$;

create or replace function pg_temp.seed_carrier_truth_case(
    p_suffix text,
    p_scan_grace_deadline timestamptz
)
returns jsonb
language plpgsql
as $$
declare
    v_seller_id bigint;
    v_product_id bigint;
    v_offer_id bigint;
    v_inventory_revision integer;
    v_checkout_group_id uuid;
    v_order_id bigint;
    v_order_public_id uuid;
    v_fee commerce.fee_policies%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_risk commerce.seller_risk_policies%rowtype;
    v_terms_hash text;
    v_payment_confirmed_at timestamptz;
begin
    if p_suffix is null or p_suffix !~ '^[a-z0-9-]+$' then
        raise exception 'fixture: invalid suffix';
    end if;
    select seller.id into v_seller_id
    from commerce.sellers seller
    where seller.slug = 'carrier-truth-seller';
    if not found then
        insert into commerce.sellers (
            kind, cms_user_id, slug, display_name,
            verification_status, verified_at, verified_by
        ) values (
            'user', 'carrier-truth-seller', 'carrier-truth-seller',
            'Carrier truth seller', 'verified', now(), 'contract'
        ) returning id into v_seller_id;
    end if;

    select fee.* into v_fee
    from commerce.settings settings
    join commerce.fee_policies fee
      on fee.id = settings.active_c2c_fee_policy_id
    where settings.id = 'default';
    select protection.* into v_protection
    from commerce.settings settings
    join commerce.protection_policies protection
      on protection.id = settings.active_c2c_protection_policy_id
    where settings.id = 'default';
    select risk.* into v_risk
    from commerce.settings settings
    join commerce.seller_risk_policies risk
      on risk.id = settings.active_c2c_seller_risk_policy_id
    where settings.id = 'default';

    insert into commerce.products (slug, title, status, visibility)
    values (
        'carrier-truth-product-' || p_suffix,
        'Carrier truth product ' || p_suffix,
        'active',
        'public'
    ) returning id into v_product_id;
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values (
        v_seller_id, v_product_id, 'carrier-truth-offer-' || p_suffix,
        'Carrier truth offer ' || p_suffix, 'good', 'active', 'approved',
        10000, 'eur', 'available', 1
    ) returning id, inventory_revision
      into v_offer_id, v_inventory_revision;

    insert into commerce.checkout_groups (
        buyer_cms_user_id, idempotency_key, request_hash
    ) values (
        'carrier-truth-buyer-' || p_suffix,
        'carrier-truth-checkout-' || p_suffix,
        md5('carrier-truth-checkout-' || p_suffix)
    ) returning id into v_checkout_group_id;
    insert into commerce.orders (
        order_number, checkout_group_id, seller_id, buyer_cms_user_id,
        status, currency, subtotal_amount, shipping_amount, total_amount,
        idempotency_key, request_hash
    ) values (
        'CARRIER-TRUTH-' || upper(p_suffix),
        v_checkout_group_id,
        v_seller_id,
        'carrier-truth-buyer-' || p_suffix,
        'active',
        'eur',
        10000,
        500,
        10500,
        'carrier-truth-checkout-' || p_suffix,
        md5('carrier-truth-checkout-' || p_suffix)
    ) returning id, public_id into v_order_id, v_order_public_id;

    insert into commerce.order_lines (
        order_id, seller_id, offer_id, product_id, title, quantity,
        inventory_reserved, availability_before, inventory_revision_before,
        unit_amount, total_amount, product_snapshot, offer_snapshot, seller_snapshot
    ) values (
        v_order_id, v_seller_id, v_offer_id, v_product_id,
        'Carrier truth offer ' || p_suffix, 1,
        1, 'available', v_inventory_revision,
        10000, 10000, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
    update commerce.offers
    set quantity_available = 0, availability = 'unavailable'
    where id = v_offer_id;

    v_terms_hash := encode(
        extensions.digest('carrier-truth:' || p_suffix, 'sha256'),
        'hex'
    );
    v_payment_confirmed_at := least(
        clock_timestamp() - interval '4 hours',
        p_scan_grace_deadline - interval '2 hours'
    );
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
        expected_platform_margin_amount, currency, financial_terms_hash,
        pricing_locked_at, pay_by_at
    ) values (
        v_order_id, v_fee.id, v_fee.version, to_jsonb(v_fee),
        v_protection.id, v_protection.version, to_jsonb(v_protection),
        v_risk.id, v_risk.version, to_jsonb(v_risk),
        'carrier-truth-quote-' || p_suffix,
        10000, 500, 500, 0, 500, 0,
        11000, 10000, 10000, 0, 1000,
        50, 100, 50, 100, 800,
        'eur', v_terms_hash,
        v_payment_confirmed_at - interval '30 minutes',
        v_payment_confirmed_at + interval '30 minutes'
    );
    insert into commerce.order_fulfillments (
        order_id, status, provider_reference, payment_confirmed_at,
        seller_handoff_deadline, scan_grace_deadline
    ) values (
        v_order_id, 'label_created', 'shipment-' || p_suffix,
        v_payment_confirmed_at,
        p_scan_grace_deadline - interval '1 hour',
        p_scan_grace_deadline
    );
    insert into commerce.order_settlements (
        order_id, status, authorized_seller_amount,
        seller_reserve_liability_remaining_amount,
        platform_gross_remainder_amount
    ) values (v_order_id, 'held', 10000, 0, 1000);
    insert into commerce.order_payment_attempts (
        order_id, provider_payment_id, provider_payment_intent_id,
        provider_charge_id, client_reference_id, status, amount,
        currency, financial_terms_hash, succeeded_at
    ) values (
        v_order_id, 900000 + v_order_id,
        'pi_carrier_truth_' || v_order_id,
        'ch_carrier_truth_' || v_order_id,
        v_order_public_id::text,
        'succeeded',
        11000,
        'eur',
        v_terms_hash,
        v_payment_confirmed_at
    );
    return jsonb_build_object(
        'orderId', v_order_id,
        'publicId', v_order_public_id,
        'offerId', v_offer_id
    );
end;
$$;
