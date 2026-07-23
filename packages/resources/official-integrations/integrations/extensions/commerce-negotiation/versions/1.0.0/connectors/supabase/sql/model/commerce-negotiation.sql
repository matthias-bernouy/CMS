

create schema if not exists commerce_negotiation;

revoke all on schema commerce_negotiation from public;
revoke all on schema commerce_negotiation from anon;
revoke all on schema commerce_negotiation from authenticated;

create table if not exists commerce_negotiation.settings (
    id text primary key default 'default',
    minimum_ratio_bps integer not null default 8000,
    maximum_ratio_bps integer not null default 12000,
    proposal_ttl_hours integer not null default 72,
    accepted_checkout_ttl_hours integer not null default 24,
    enabled boolean not null default true,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint negotiation_settings_singleton check (id = 'default'),
    constraint negotiation_settings_minimum_ratio check (minimum_ratio_bps between 1 and 10000),
    constraint negotiation_settings_maximum_ratio check (maximum_ratio_bps between 10000 and 20000),
    constraint negotiation_settings_ratio_order check (minimum_ratio_bps <= maximum_ratio_bps),
    constraint negotiation_settings_ttl check (proposal_ttl_hours between 1 and 720),
    constraint negotiation_settings_checkout_ttl check (accepted_checkout_ttl_hours between 1 and 720),
    constraint negotiation_settings_version_positive check (version > 0)
);

alter table commerce_negotiation.settings
    add column if not exists accepted_checkout_ttl_hours integer not null default 24;

insert into commerce_negotiation.settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists commerce_negotiation.proposals (
    id bigint generated always as identity primary key,
    public_id uuid not null default gen_random_uuid() unique,
    commerce_offer_id bigint not null,
    commerce_offer_slug text not null,
    commerce_offer_title text not null,
    offer_main_image_media_id bigint,
    seller_cms_user_id text not null,
    seller_display_name text not null,
    buyer_cms_user_id text not null,
    reference_amount bigint not null,
    minimum_amount bigint not null,
    maximum_amount bigint not null,
    proposed_amount bigint not null,
    currency text not null,
    buyer_message text,
    decision_message text,
    status text not null default 'pending',
    version integer not null default 1,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    commerce_agreement_id uuid,
    checkout_expires_at timestamptz,
    rejected_at timestamptz,
    withdrawn_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint negotiation_proposals_offer_positive check (commerce_offer_id > 0),
    constraint negotiation_proposals_offer_slug_not_blank check (length(btrim(commerce_offer_slug)) > 0),
    constraint negotiation_proposals_offer_title_not_blank check (length(btrim(commerce_offer_title)) > 0),
    constraint negotiation_proposals_offer_media_positive check (
        offer_main_image_media_id is null or offer_main_image_media_id > 0
    ),
    constraint negotiation_proposals_seller_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint negotiation_proposals_buyer_not_blank check (length(btrim(buyer_cms_user_id)) > 0),
    constraint negotiation_proposals_distinct_parties check (seller_cms_user_id <> buyer_cms_user_id),
    constraint negotiation_proposals_amounts check (
        reference_amount between 1 and 9007199254740991
        and minimum_amount between 1 and reference_amount
        and maximum_amount between reference_amount and 9007199254740991
        and proposed_amount between minimum_amount and maximum_amount
    ),
    constraint negotiation_proposals_currency check (currency ~ '^[a-z]{3}$'),
    constraint negotiation_proposals_messages check (
        (buyer_message is null or length(buyer_message) <= 2000)
        and (decision_message is null or length(decision_message) <= 2000)
    ),
    constraint negotiation_proposals_status check (
        status in ('pending', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded', 'canceled')
    ),
    constraint negotiation_proposals_version_positive check (version > 0),
    constraint negotiation_proposals_expiry_after_creation check (expires_at > created_at),
    constraint negotiation_proposals_checkout_link check (
        (commerce_agreement_id is null and checkout_expires_at is null)
        or (commerce_agreement_id is not null and checkout_expires_at is not null)
    ),
    constraint negotiation_proposals_commerce_agreement_fk
        foreign key (commerce_agreement_id)
        references commerce.price_agreements(public_id) on delete restrict,
    constraint negotiation_proposals_decision_timestamps check (
        (status = 'accepted' and accepted_at is not null)
        or (status = 'rejected' and rejected_at is not null)
        or (status = 'withdrawn' and withdrawn_at is not null)
        or status not in ('accepted', 'rejected', 'withdrawn')
    )
);

alter table commerce_negotiation.proposals
    add column if not exists offer_main_image_media_id bigint;

alter table commerce_negotiation.proposals
    add column if not exists commerce_agreement_id uuid;

alter table commerce_negotiation.proposals
    add column if not exists checkout_expires_at timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'negotiation_settings_checkout_ttl'
          and conrelid = 'commerce_negotiation.settings'::regclass
    ) then
        alter table commerce_negotiation.settings
            add constraint negotiation_settings_checkout_ttl
            check (accepted_checkout_ttl_hours between 1 and 720);
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'negotiation_proposals_offer_media_positive'
          and conrelid = 'commerce_negotiation.proposals'::regclass
    ) then
        alter table commerce_negotiation.proposals
            add constraint negotiation_proposals_offer_media_positive
            check (offer_main_image_media_id is null or offer_main_image_media_id > 0);
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'negotiation_proposals_checkout_link'
          and conrelid = 'commerce_negotiation.proposals'::regclass
    ) then
        alter table commerce_negotiation.proposals
            add constraint negotiation_proposals_checkout_link
            check (
                (commerce_agreement_id is null and checkout_expires_at is null)
                or (commerce_agreement_id is not null and checkout_expires_at is not null)
            );
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'negotiation_proposals_commerce_agreement_fk'
          and conrelid = 'commerce_negotiation.proposals'::regclass
    ) then
        alter table commerce_negotiation.proposals
            add constraint negotiation_proposals_commerce_agreement_fk
            foreign key (commerce_agreement_id)
            references commerce.price_agreements(public_id) on delete restrict;
    end if;
end $$;

create unique index if not exists negotiation_proposals_commerce_agreement_unique
    on commerce_negotiation.proposals(commerce_agreement_id)
    where commerce_agreement_id is not null;

create unique index if not exists negotiation_proposals_one_pending_per_buyer_offer
    on commerce_negotiation.proposals(commerce_offer_id, buyer_cms_user_id)
    where status = 'pending';

create unique index if not exists negotiation_proposals_one_accepted_per_offer
    on commerce_negotiation.proposals(commerce_offer_id)
    where status = 'accepted';

create index if not exists negotiation_proposals_buyer_status_created_idx
    on commerce_negotiation.proposals(buyer_cms_user_id, status, created_at desc);

create index if not exists negotiation_proposals_seller_status_created_idx
    on commerce_negotiation.proposals(seller_cms_user_id, status, created_at desc);

create index if not exists negotiation_proposals_offer_created_idx
    on commerce_negotiation.proposals(commerce_offer_id, created_at desc);

create index if not exists negotiation_proposals_pending_expiry_idx
    on commerce_negotiation.proposals(expires_at)
    where status = 'pending';

create table if not exists commerce_negotiation.proposal_events (
    id bigint generated always as identity primary key,
    proposal_id bigint not null references commerce_negotiation.proposals(id) on delete cascade,
    event_type text not null,
    actor_kind text not null,
    actor_id text not null,
    previous_status text,
    next_status text not null,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint negotiation_proposal_events_type check (
        event_type in ('created', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded', 'canceled')
    ),
    constraint negotiation_proposal_events_actor_kind check (actor_kind in ('buyer', 'seller', 'admin', 'system')),
    constraint negotiation_proposal_events_actor_not_blank check (length(btrim(actor_id)) > 0),
    constraint negotiation_proposal_events_data_object check (jsonb_typeof(data) = 'object')
);

create index if not exists negotiation_proposal_events_proposal_created_idx
    on commerce_negotiation.proposal_events(proposal_id, created_at);

create or replace function commerce_negotiation.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
