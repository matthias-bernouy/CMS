

create table if not exists commerce.settings (
    id text primary key default 'default',
    mode text not null default 'marketplace',
    default_currency text not null default 'eur',
    require_verified_seller boolean not null default true,
    offer_moderation text not null default 'always',
    price_policy text not null default 'admin_range',
    auto_approve_price_in_range boolean not null default false,
    require_final_price_approval boolean not null default true,
    seller_can_publish boolean not null default false,
    active_c2c_fee_policy_id bigint not null references commerce.fee_policies(id) on delete restrict,
    active_c2c_protection_policy_id bigint not null references commerce.protection_policies(id) on delete restrict,
    active_c2c_seller_risk_policy_id bigint not null references commerce.seller_risk_policies(id) on delete restrict,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint settings_singleton check (id = 'default'),
    constraint settings_mode check (mode in ('ecommerce', 'marketplace', 'hybrid')),
    constraint settings_currency check (default_currency ~ '^[a-z]{3}$'),
    constraint settings_offer_moderation check (offer_moderation in ('none', 'always')),
    constraint settings_price_policy check (price_policy in ('free', 'admin_range')),
    constraint settings_version_positive check (version > 0)
);

alter table commerce.settings
    add column if not exists active_c2c_fee_policy_id bigint references commerce.fee_policies(id) on delete restrict;
alter table commerce.settings
    add column if not exists active_c2c_protection_policy_id bigint references commerce.protection_policies(id) on delete restrict;
alter table commerce.settings
    add column if not exists active_c2c_seller_risk_policy_id bigint references commerce.seller_risk_policies(id) on delete restrict;