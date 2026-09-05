

create table if not exists stripe_connect.platform_payout_controls (
    control_key text primary key default 'default',
    liability_revision bigint not null default 0,
    required_minimum_amount bigint not null default 0,
    provider_minimum_amount bigint not null default 0,
    decrease_authorization_id uuid,
    claim_owner text,
    claimed_at timestamptz,
    last_error text,
    last_provider_sync_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint platform_payout_controls_singleton check (control_key = 'default'),
    constraint platform_payout_controls_amounts_safe check (
        liability_revision between 0 and 9007199254740991
        and required_minimum_amount between 0 and 9007199254740991
        and provider_minimum_amount between 0 and 9007199254740991
    ),
    constraint platform_payout_controls_decrease_authorization check (
        decrease_authorization_id is null
        or required_minimum_amount < provider_minimum_amount
    ),
    constraint platform_payout_controls_claim_consistent check (
        (claim_owner is null and claimed_at is null)
        or (claim_owner is not null and length(btrim(claim_owner)) > 0 and claimed_at is not null)
    )
);

insert into stripe_connect.platform_payout_controls (control_key)
values ('default')
on conflict (control_key) do nothing;
