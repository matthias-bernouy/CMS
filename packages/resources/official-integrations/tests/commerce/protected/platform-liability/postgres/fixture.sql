drop schema if exists commerce_liability_test cascade;
create schema commerce_liability_test;

create table commerce_liability_test.orders (
    label text primary key,
    order_id bigint not null,
    public_id uuid not null,
    terms jsonb not null,
    preparation jsonb
);

create function commerce_liability_test.seed_order(
    p_label text,
    p_subtotal bigint,
    p_prepare boolean default true
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_group_id uuid;
    v_order commerce.orders%rowtype;
    v_terms jsonb;
    v_preparation jsonb;
    v_seller_id bigint;
begin
    select id into v_seller_id
    from commerce.sellers
    where slug = 'liability-contract-seller';

    insert into commerce.checkout_groups (
        buyer_cms_user_id, idempotency_key, request_hash
    ) values (
        'liability-buyer-' || p_label,
        'liability-checkout-' || p_label,
        pg_catalog.md5(p_label)
    ) returning id into v_group_id;

    insert into commerce.orders (
        order_number, checkout_group_id, seller_id, buyer_cms_user_id,
        currency, subtotal_amount, total_amount, idempotency_key, request_hash
    ) values (
        'LIABILITY-' || pg_catalog.upper(p_label), v_group_id, v_seller_id,
        'liability-buyer-' || p_label, 'eur', p_subtotal, p_subtotal,
        'liability-checkout-' || p_label, pg_catalog.md5(p_label)
    ) returning * into v_order;

    v_terms := commerce.lock_order_financial_terms(
        v_order.public_id, v_order.buyer_cms_user_id,
        'liability-quote-' || p_label, 0, 'eur', v_order.version,
        'liability-contract-test'
    );
    if p_prepare then
        v_preparation := commerce.prepare_protected_payment(
            v_order.id, v_order.buyer_cms_user_id
        );
    end if;
    insert into commerce_liability_test.orders
    values (p_label, v_order.id, v_order.public_id, v_terms, v_preparation);
end;
$$;

select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Liability contract policy',
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
    'liability-contract-admin',
    (select version from commerce.settings where id = 'default')
);

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name,
    verification_status, verified_at, verified_by
) values (
    'user', 'liability-contract-seller', 'liability-contract-seller',
    'Liability contract seller', 'verified', now(), 'liability-contract-admin'
);

grant usage on schema commerce_liability_test to service_role;
grant select, insert on commerce_liability_test.orders to service_role;
grant execute on function commerce_liability_test.seed_order(text, bigint, boolean)
to service_role;
