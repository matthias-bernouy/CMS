-- Payment-confirmation and fulfillment-deadline fixtures.
\set ON_ERROR_STOP on

begin;
set local role service_role;

select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Payment-confirmed deadline contract',
        'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 50,
        'estimatedCarrierCostAmount', 100,
        'platformRiskReserveContributionAmount', 50,
        'configuredMinimumMarginAmount', 100,
        'buyerFeeFixedAmount', 500,
        'sellerFeeRateBps', 500,
        'sellerHandoffHours', 72,
        'scanGraceHours', 48,
        'sellerReserveRateBps', 1000,
        'payoutDelayDays', 14,
        'highValueReviewAmount', 500000,
        'claimRatioReviewBps', 10000
    ),
    'protected-deadline-contract',
    (select version from commerce.settings where id = 'default')
);

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name,
    verification_status, verified_at, verified_by
) values (
    'user', 'deadline-payment-seller', 'deadline-payment-seller',
    'Deadline payment seller', 'verified', now(), 'protected-deadline-contract'
) returning id as deadline_payment_seller_id \gset

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'deadline-payment-buyer',
    'deadline-payment-checkout',
    md5('deadline-payment-checkout')
) returning id as deadline_payment_checkout_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'DEADLINE-PAYMENT-CONFIRMATION',
    :'deadline_payment_checkout_id',
    :deadline_payment_seller_id,
    'deadline-payment-buyer',
    'eur',
    10000,
    10000,
    'deadline-payment-checkout',
    md5('deadline-payment-checkout')
) returning id as deadline_payment_order_id,
    public_id as deadline_payment_order_public_id,
    version as deadline_payment_order_version \gset

select result->>'financial_terms_hash' as deadline_payment_terms_hash,
    (result->>'buyer_total_amount')::bigint as deadline_payment_buyer_total
from (
    select commerce.lock_order_financial_terms(
        :'deadline_payment_order_public_id',
        'deadline-payment-buyer',
        'deadline-payment-quote',
        1200,
        'eur',
        :deadline_payment_order_version,
        'protected-deadline-contract'
    ) result
) locked \gset
\ir payment-confirmation-behavior.sql
