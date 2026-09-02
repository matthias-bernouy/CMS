drop schema if exists payment_projection_test cascade;
create schema payment_projection_test;

create function payment_projection_test.cleanup()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from stripe_connect.payment_events
    where payment_id in (
        select id from stripe_connect.payments
        where client_reference_id like 'payment-projection-pg-%'
    );
    delete from stripe_connect.provider_exceptions
    where payment_id in (
        select id from stripe_connect.payments
        where client_reference_id like 'payment-projection-pg-%'
    );
    delete from stripe_connect.commerce_projection_outbox
    where payment_id in (
        select id from stripe_connect.payments
        where client_reference_id like 'payment-projection-pg-%'
    );
    delete from stripe_connect.payments
    where client_reference_id like 'payment-projection-pg-%';
    delete from stripe_connect.accounts
    where cms_user_id like 'payment-projection-pg-seller-%';
end;
$$;

create function payment_projection_test.seed(p_case text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payment_id bigint;
    v_suffix text := pg_catalog.lower(pg_catalog.btrim(p_case));
begin
    if v_suffix !~ '^[a-z0-9-]+$' then
        raise exception 'payment projection fixture: invalid case';
    end if;
    insert into stripe_connect.accounts (
        cms_user_id, stripe_account_id, terms_accepted,
        onboarding_status, charges_enabled, payouts_enabled
    ) values (
        'payment-projection-pg-seller-' || v_suffix,
        'acct_payment_projection_' || v_suffix,
        true, 'enabled', true, true
    );
    insert into stripe_connect.payments (
        client_reference_id, financial_terms_hash,
        dual_approval_threshold_amount, buyer_cms_user_id,
        seller_cms_user_id, seller_stripe_account_id,
        stripe_payment_intent_id, transfer_group,
        amount_total, seller_transfer_amount, platform_retained_amount
    ) values (
        'payment-projection-pg-' || v_suffix,
        pg_catalog.repeat('a', 64), 1000,
        'payment-projection-pg-buyer-' || v_suffix,
        'payment-projection-pg-seller-' || v_suffix,
        'acct_payment_projection_' || v_suffix,
        'pi_payment_projection_' || v_suffix,
        'cms_payment_projection_' || v_suffix,
        1200, 1080, 120
    ) returning id into v_payment_id;
    return v_payment_id;
end;
$$;

create function payment_projection_test.snapshot(p_payment_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select pg_catalog.to_jsonb(payment)
    from stripe_connect.payments payment
    where payment.id = p_payment_id
$$;

create function payment_projection_test.apply_projection(
    p_payment_id bigint,
    p_projection_key text,
    p_last_provider_sync_at timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'kind', 'apply',
        'paymentStatus', 'succeeded',
        'stripePaymentIntentId', payment.stripe_payment_intent_id,
        'stripeChargeId', 'ch_payment_projection_' || payment.id,
        'stripeChargeBalanceTransactionId',
            'txn_payment_projection_' || payment.id,
        'actualStripeChargeFeeAmount', 65,
        'actualStripeProcessingFeeAmount', 65,
        'actualStripeChargeNetAmount', 1135,
        'actualStripeFeeCurrency', 'eur',
        'actualStripeChargeFeeDetails',
            '[{"type":"stripe_fee","amount":65,"currency":"eur"}]'::jsonb,
        'paidAt', '2026-07-21 08:00:00+00'::timestamptz,
        'cancelledAt', null,
        'lastProviderSyncAt', p_last_provider_sync_at,
        'projectionKey', p_projection_key,
        'recoveredProjectionKey', null,
        'recovery', null
    )
    from stripe_connect.payments payment
    where payment.id = p_payment_id
$$;

create function payment_projection_test.quarantine_projection(
    p_payment_id bigint,
    p_projection_key text,
    p_last_provider_sync_at timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'kind', 'quarantine',
        'paymentStatus', 'failed',
        'settlementStatus', 'manual_review',
        'manualReviewReason',
            'Stripe payment provider truth mismatch: payment_intent_amount',
        'stripePaymentIntentId', payment.stripe_payment_intent_id,
        'stripeChargeId', 'ch_payment_projection_' || payment.id,
        'paidAt', null,
        'lastProviderSyncAt', p_last_provider_sync_at,
        'projectionKey', p_projection_key,
        'exceptionKey', 'provider-payment-truth:' || payment.id || ':'
            || payment.stripe_payment_intent_id,
        'actorKind', 'reconciliation',
        'actorId', 'provider-sync',
        'details', pg_catalog.jsonb_build_object(
            'paymentIntentId', payment.stripe_payment_intent_id,
            'chargeId', 'ch_payment_projection_' || payment.id,
            'mismatches', pg_catalog.jsonb_build_array('payment_intent_amount')
        )
    )
    from stripe_connect.payments payment
    where payment.id = p_payment_id
$$;

revoke all on schema payment_projection_test from public;
revoke all on all functions in schema payment_projection_test from public;
grant usage on schema payment_projection_test to service_role;
grant execute on all functions in schema payment_projection_test to service_role;

select payment_projection_test.cleanup();
