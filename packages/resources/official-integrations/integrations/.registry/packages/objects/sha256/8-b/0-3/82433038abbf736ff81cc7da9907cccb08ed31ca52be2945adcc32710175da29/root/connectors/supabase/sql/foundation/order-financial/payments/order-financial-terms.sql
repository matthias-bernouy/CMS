

create table if not exists commerce.order_financial_terms (
    order_id bigint primary key references commerce.orders(id) on delete restrict,
    fee_policy_id bigint not null references commerce.fee_policies(id) on delete restrict,
    fee_policy_version integer not null,
    fee_policy_snapshot jsonb not null,
    protection_policy_id bigint not null references commerce.protection_policies(id) on delete restrict,
    protection_policy_version integer not null,
    protection_policy_snapshot jsonb not null,
    seller_risk_policy_id bigint not null references commerce.seller_risk_policies(id) on delete restrict,
    seller_risk_policy_version integer not null,
    seller_risk_policy_snapshot jsonb not null,
    delivery_quote_id text not null,
    merchandise_subtotal_amount bigint not null,
    shipping_amount bigint not null,
    buyer_protection_fee_amount bigint not null,
    seller_commission_amount bigint not null,
    platform_shipping_share_amount bigint not null,
    seller_shipping_share_amount bigint not null,
    buyer_total_amount bigint not null,
    seller_proceeds_amount bigint not null,
    seller_transfer_release_amount bigint not null,
    seller_reserve_liability_amount bigint not null,
    platform_retained_amount bigint not null,
    estimated_stripe_cost_amount bigint not null,
    estimated_carrier_cost_amount bigint not null,
    platform_risk_reserve_contribution_amount bigint not null,
    configured_minimum_margin_amount bigint not null,
    expected_platform_margin_amount bigint not null,
    subsidy_override_id bigint references commerce.financial_subsidy_overrides(id) on delete restrict,
    currency text not null,
    financial_terms_hash text not null,
    pricing_locked_at timestamptz not null default now(),
    pay_by_at timestamptz not null,
    financial_revision integer not null default 1,
    constraint order_financial_terms_quote check (length(btrim(delivery_quote_id)) > 0),
    constraint order_financial_terms_currency check (currency = 'eur'),
    constraint order_financial_terms_snapshots check (
        jsonb_typeof(fee_policy_snapshot) = 'object'
        and jsonb_typeof(protection_policy_snapshot) = 'object'
        and jsonb_typeof(seller_risk_policy_snapshot) = 'object'
    ),
    constraint order_financial_terms_hash check (financial_terms_hash ~ '^[a-f0-9]{64}$'),
    constraint order_financial_terms_revision check (financial_revision > 0),
    constraint order_financial_terms_payment_window check (pay_by_at > pricing_locked_at),
    constraint order_financial_terms_non_negative check (
        merchandise_subtotal_amount between 0 and 9007199254740991
        and shipping_amount between 0 and 9007199254740991
        and buyer_protection_fee_amount between 0 and 9007199254740991
        and seller_commission_amount between 0 and 9007199254740991
        and platform_shipping_share_amount between 0 and 9007199254740991
        and seller_shipping_share_amount between 0 and 9007199254740991
        and buyer_total_amount between 0 and 9007199254740991
        and seller_proceeds_amount between 0 and 9007199254740991
        and seller_transfer_release_amount between 0 and 9007199254740991
        and seller_reserve_liability_amount between 0 and 9007199254740991
        and platform_retained_amount between 0 and 9007199254740991
        and estimated_stripe_cost_amount between 0 and 9007199254740991
        and estimated_carrier_cost_amount between 0 and 9007199254740991
        and platform_risk_reserve_contribution_amount between 0 and 9007199254740991
        and configured_minimum_margin_amount between 0 and 9007199254740991
    ),
    constraint order_financial_terms_shipping_identity check (
        shipping_amount = platform_shipping_share_amount + seller_shipping_share_amount
    ),
    constraint order_financial_terms_seller_commission_limit check (
        seller_commission_amount <= merchandise_subtotal_amount + seller_shipping_share_amount
    ),
    constraint order_financial_terms_seller_identity check (
        seller_proceeds_amount = merchandise_subtotal_amount + seller_shipping_share_amount - seller_commission_amount
        and seller_proceeds_amount = seller_transfer_release_amount + seller_reserve_liability_amount
    ),
    constraint order_financial_terms_platform_identity check (
        platform_retained_amount = buyer_protection_fee_amount + seller_commission_amount + platform_shipping_share_amount
        and buyer_total_amount = seller_proceeds_amount + platform_retained_amount
    ),
    constraint order_financial_terms_margin_identity check (
        expected_platform_margin_amount = platform_retained_amount
            - estimated_stripe_cost_amount - estimated_carrier_cost_amount
            - platform_risk_reserve_contribution_amount
    )
);

create index if not exists order_financial_terms_fee_policy_idx
    on commerce.order_financial_terms(fee_policy_id);
create index if not exists order_financial_terms_protection_policy_idx
    on commerce.order_financial_terms(protection_policy_id);
create index if not exists order_financial_terms_risk_policy_idx
    on commerce.order_financial_terms(seller_risk_policy_id);

alter table commerce.order_financial_terms
    drop constraint if exists order_financial_terms_hash;
alter table commerce.order_financial_terms
    add constraint order_financial_terms_hash check (financial_terms_hash ~ '^[a-f0-9]{64}$');