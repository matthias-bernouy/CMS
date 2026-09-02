\set ON_ERROR_STOP on

begin;
set local role service_role;

select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Refund idempotency policy',
        'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 50,
        'estimatedCarrierCostAmount', 100,
        'platformRiskReserveContributionAmount', 50,
        'configuredMinimumMarginAmount', 100,
        'buyerFeeFixedAmount', 500,
        'sellerFeeRateBps', 500,
        'sellerReserveRateBps', 1000,
        'payoutDelayDays', 14,
        'highValueReviewAmount', 500000,
        'claimRatioReviewBps', 10000
    ),
    'refund-idempotency-admin',
    (select version from commerce.settings where id = 'default')
);

select commerce.record_delivery_reconciliation_health(
    'refund-idempotency-contract',
    now(),
    0,
    0,
    0
);

insert into commerce.sellers (
    kind,
    cms_user_id,
    slug,
    display_name,
    verification_status,
    verified_at,
    verified_by
) values (
    'user',
    'refund-idempotency-seller',
    'refund-idempotency-seller',
    'Refund idempotency seller',
    'verified',
    now(),
    'refund-idempotency-admin'
) returning id as refund_idempotency_seller_id \gset

insert into commerce.checkout_groups (
    buyer_cms_user_id,
    idempotency_key,
    request_hash
) values (
    'refund-idempotency-buyer',
    'refund-idempotency-order',
    left(encode(extensions.digest(
        'refund-idempotency-order',
        'sha256'
    ), 'hex'), 32)
) returning id as refund_idempotency_checkout_group_id \gset

insert into commerce.orders (
    order_number,
    checkout_group_id,
    seller_id,
    buyer_cms_user_id,
    currency,
    subtotal_amount,
    total_amount,
    idempotency_key,
    request_hash
) values (
    'REFUND-IDEMPOTENCY-1',
    :'refund_idempotency_checkout_group_id',
    :refund_idempotency_seller_id,
    'refund-idempotency-buyer',
    'eur',
    10000,
    10000,
    'refund-idempotency-order',
    left(encode(extensions.digest(
        'refund-idempotency-order',
        'sha256'
    ), 'hex'), 32)
) returning
    id as refund_idempotency_order_id,
    public_id as refund_idempotency_order_public_id,
    version as refund_idempotency_order_version
\gset

select
    result->>'financial_terms_hash' as refund_idempotency_terms_hash,
    (result->>'buyer_total_amount')::bigint as refund_idempotency_buyer_total
from (
    select commerce.lock_order_financial_terms(
        :'refund_idempotency_order_public_id',
        'refund-idempotency-buyer',
        'refund-idempotency-quote',
        1200,
        'eur',
        :refund_idempotency_order_version,
        'refund-idempotency-delivery'
    ) result
) locked
\gset

select commerce.record_order_payment_projection(
    :'refund_idempotency_order_public_id',
    'refund-idempotency-payment-success',
    9501,
    'succeeded',
    :refund_idempotency_buyer_total,
    'eur',
    :'refund_idempotency_terms_hash',
    now(),
    '{}'::jsonb,
    'ch_refund_idempotency',
    'pi_refund_idempotency'
);

do $contract$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_first jsonb;
    v_replay jsonb;
    v_refund_id bigint;
    v_settlement_version integer;
    v_audit_count bigint;
    v_outbox_count bigint;
begin
    select * into v_order
    from commerce.orders
    where order_number = 'REFUND-IDEMPOTENCY-1';
    select * into v_terms
    from commerce.order_financial_terms
    where order_id = v_order.id;

    v_first := commerce.request_allocated_order_refund(
        v_order.id,
        'admin_full_refund',
        v_terms.merchandise_subtotal_amount,
        v_terms.shipping_amount,
        v_terms.buyer_protection_fee_amount,
        'admin',
        'refund-idempotency-admin',
        'opaque-client-operation-1'
    );
    v_refund_id := (v_first->>'id')::bigint;
    select version into v_settlement_version
    from commerce.order_settlements
    where order_id = v_order.id;
    select count(*) into v_audit_count
    from commerce.audit_events
    where order_id = v_order.id;
    select count(*) into v_outbox_count
    from commerce.outbox_events
    where order_id = v_order.id;

    v_replay := commerce.request_allocated_order_refund(
        v_order.id,
        'admin_full_refund',
        v_terms.merchandise_subtotal_amount,
        v_terms.shipping_amount,
        v_terms.buyer_protection_fee_amount,
        'admin',
        'refund-idempotency-admin',
        'opaque-client-operation-1'
    );

    if (v_first->>'idempotentReplay')::boolean is not false
        or (v_replay->>'idempotentReplay')::boolean is not true
        or (v_replay->>'id')::bigint <> v_refund_id
        or (select count(*) from commerce.refund_requests
            where order_id = v_order.id) <> 1
        or (select version from commerce.order_settlements
            where order_id = v_order.id) <> v_settlement_version
        or (select count(*) from commerce.audit_events
            where order_id = v_order.id) <> v_audit_count
        or (select count(*) from commerce.outbox_events
            where order_id = v_order.id) <> v_outbox_count then
        raise exception 'refund idempotency: exact replay mutated durable state: first=%, replay=%',
            v_first, v_replay;
    end if;

    if (select business_key from commerce.refund_requests where id = v_refund_id)
        !~ ('^admin-order-refund:v1:' || v_order.id || ':[a-f0-9]{64}$')
        or (select business_key from commerce.refund_requests where id = v_refund_id)
            like '%opaque-client-operation-1%' then
        raise exception 'refund idempotency: opaque client key was not server-namespaced and hashed';
    end if;

    begin
        perform commerce.request_allocated_order_refund(
            v_order.id,
            'changed_reason',
            v_terms.merchandise_subtotal_amount,
            v_terms.shipping_amount,
            v_terms.buyer_protection_fee_amount,
            'admin',
            'refund-idempotency-admin',
            'opaque-client-operation-1'
        );
        raise exception 'refund idempotency: a reason collision was accepted';
    exception
        when others then
            if sqlerrm <> 'conflict: allocated refund idempotency key was already used with another immutable payload' then
                raise;
            end if;
    end;

    begin
        perform commerce.request_allocated_order_refund(
            v_order.id,
            'admin_full_refund',
            v_terms.merchandise_subtotal_amount - 1,
            v_terms.shipping_amount,
            v_terms.buyer_protection_fee_amount,
            'admin',
            'refund-idempotency-admin',
            'opaque-client-operation-1'
        );
        raise exception 'refund idempotency: an amount collision was accepted';
    exception
        when others then
            if sqlerrm <> 'conflict: allocated refund idempotency key was already used with another immutable payload' then
                raise;
            end if;
    end;

    if (select count(*) from commerce.refund_requests
        where order_id = v_order.id) <> 1
        or (select count(*) from commerce.audit_events
            where order_id = v_order.id) <> v_audit_count
        or (select count(*) from commerce.outbox_events
            where order_id = v_order.id) <> v_outbox_count then
        raise exception 'refund idempotency: collision handling mutated durable state';
    end if;
end;
$contract$;

insert into commerce.checkout_groups (
    buyer_cms_user_id,
    idempotency_key,
    request_hash
) values (
    'refund-concurrency-buyer',
    'refund-concurrency-order',
    left(encode(extensions.digest(
        'refund-concurrency-order',
        'sha256'
    ), 'hex'), 32)
) returning id as refund_concurrency_checkout_group_id
\gset

insert into commerce.orders (
    order_number,
    checkout_group_id,
    seller_id,
    buyer_cms_user_id,
    currency,
    subtotal_amount,
    total_amount,
    idempotency_key,
    request_hash
) values (
    'REFUND-CONCURRENCY-1',
    :'refund_concurrency_checkout_group_id',
    :refund_idempotency_seller_id,
    'refund-concurrency-buyer',
    'eur',
    10000,
    10000,
    'refund-concurrency-order',
    left(encode(extensions.digest(
        'refund-concurrency-order',
        'sha256'
    ), 'hex'), 32)
) returning
    public_id as refund_concurrency_order_public_id,
    version as refund_concurrency_order_version
\gset

select
    result->>'financial_terms_hash' as refund_concurrency_terms_hash,
    (result->>'buyer_total_amount')::bigint as refund_concurrency_buyer_total
from (
    select commerce.lock_order_financial_terms(
        :'refund_concurrency_order_public_id',
        'refund-concurrency-buyer',
        'refund-concurrency-quote',
        1200,
        'eur',
        :refund_concurrency_order_version,
        'refund-concurrency-delivery'
    ) result
) locked
\gset

select commerce.record_order_payment_projection(
    :'refund_concurrency_order_public_id',
    'refund-concurrency-payment-success',
    9502,
    'succeeded',
    :refund_concurrency_buyer_total,
    'eur',
    :'refund_concurrency_terms_hash',
    now(),
    '{}'::jsonb,
    'ch_refund_concurrency',
    'pi_refund_concurrency'
);

commit;
