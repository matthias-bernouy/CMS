-- Private Supabase schema for bounded C2C price negotiations.
-- Commerce owns listings and orders; this schema owns negotiation agreements.

begin;

create schema if not exists commerce_negotiation;

revoke all on schema commerce_negotiation from public;
revoke all on schema commerce_negotiation from anon;
revoke all on schema commerce_negotiation from authenticated;

create table if not exists commerce_negotiation.settings (
    id text primary key default 'default',
    minimum_ratio_bps integer not null default 8000,
    maximum_ratio_bps integer not null default 12000,
    proposal_ttl_hours integer not null default 72,
    enabled boolean not null default true,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint negotiation_settings_singleton check (id = 'default'),
    constraint negotiation_settings_minimum_ratio check (minimum_ratio_bps between 1 and 10000),
    constraint negotiation_settings_maximum_ratio check (maximum_ratio_bps between 10000 and 20000),
    constraint negotiation_settings_ratio_order check (minimum_ratio_bps <= maximum_ratio_bps),
    constraint negotiation_settings_ttl check (proposal_ttl_hours between 1 and 720),
    constraint negotiation_settings_version_positive check (version > 0)
);

insert into commerce_negotiation.settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists commerce_negotiation.proposals (
    id bigint generated always as identity primary key,
    public_id uuid not null default gen_random_uuid() unique,
    commerce_offer_id bigint not null,
    commerce_offer_slug text not null,
    commerce_offer_title text not null,
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
    rejected_at timestamptz,
    withdrawn_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint negotiation_proposals_offer_positive check (commerce_offer_id > 0),
    constraint negotiation_proposals_offer_slug_not_blank check (length(btrim(commerce_offer_slug)) > 0),
    constraint negotiation_proposals_offer_title_not_blank check (length(btrim(commerce_offer_title)) > 0),
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
    constraint negotiation_proposals_decision_timestamps check (
        (status = 'accepted' and accepted_at is not null)
        or (status = 'rejected' and rejected_at is not null)
        or (status = 'withdrawn' and withdrawn_at is not null)
        or status not in ('accepted', 'rejected', 'withdrawn')
    )
);

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

create or replace function commerce_negotiation.bump_proposal_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if row(new.*) is distinct from row(old.*) then
        new.version = old.version + 1;
    end if;
    return new;
end;
$$;

create or replace function commerce_negotiation.bump_settings_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if row(new.*) is distinct from row(old.*) then
        new.version = old.version + 1;
    end if;
    return new;
end;
$$;

drop trigger if exists negotiation_proposals_bump_version on commerce_negotiation.proposals;
create trigger negotiation_proposals_bump_version
before update on commerce_negotiation.proposals
for each row execute function commerce_negotiation.bump_proposal_version();

drop trigger if exists negotiation_proposals_set_updated_at on commerce_negotiation.proposals;
create trigger negotiation_proposals_set_updated_at
before update on commerce_negotiation.proposals
for each row execute function commerce_negotiation.set_updated_at();

drop trigger if exists negotiation_settings_bump_version on commerce_negotiation.settings;
create trigger negotiation_settings_bump_version
before update on commerce_negotiation.settings
for each row execute function commerce_negotiation.bump_settings_version();

drop trigger if exists negotiation_settings_set_updated_at on commerce_negotiation.settings;
create trigger negotiation_settings_set_updated_at
before update on commerce_negotiation.settings
for each row execute function commerce_negotiation.set_updated_at();

create or replace function commerce_negotiation.expire_pending_proposals()
returns integer
language plpgsql
set search_path = ''
as $$
declare
    v_count integer;
begin
    with expired as (
        update commerce_negotiation.proposals
        set status = 'expired'
        where status = 'pending' and expires_at <= now()
        returning id, version
    ), events as (
        insert into commerce_negotiation.proposal_events (
            proposal_id, event_type, actor_kind, actor_id, previous_status, next_status
        )
        select id, 'expired', 'system', 'expiration', 'pending', 'expired'
        from expired
        returning 1
    )
    select count(*) into v_count from events;
    return v_count;
end;
$$;

create or replace function commerce_negotiation.list_participant_proposals(
    p_user_id text,
    p_role text default null,
    p_status text default null,
    p_offer_id bigint default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
    v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
    if p_user_id is null or btrim(p_user_id) = '' then
        raise exception 'unauthorized: CMS user identity required';
    end if;
    if p_role is not null and p_role not in ('buyer', 'seller') then
        raise exception 'validation: role is invalid';
    end if;
    perform commerce_negotiation.expire_pending_proposals();
    return (
        with filtered as materialized (
            select proposal.*
            from commerce_negotiation.proposals proposal
            where case p_role
                when 'buyer' then proposal.buyer_cms_user_id = p_user_id
                when 'seller' then proposal.seller_cms_user_id = p_user_id
                else proposal.buyer_cms_user_id = p_user_id
                    or proposal.seller_cms_user_id = p_user_id
            end
              and (p_status is null or proposal.status = p_status)
              and (p_offer_id is null or proposal.commerce_offer_id = p_offer_id)
        ), page as (
            select filtered.*
            from filtered
            order by filtered.created_at desc
            limit v_limit offset v_offset
        )
        select jsonb_build_object(
            'items', coalesce(
                (select jsonb_agg(to_jsonb(page) order by page.created_at desc) from page),
                '[]'::jsonb
            ),
            'total', (select count(*) from filtered)
        )
    );
end;
$$;

create or replace function commerce_negotiation.list_admin_proposals(
    p_query text default null,
    p_status text default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
    v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
    perform commerce_negotiation.expire_pending_proposals();
    return (
        with filtered as materialized (
            select proposal.*
            from commerce_negotiation.proposals proposal
            where (p_status is null or proposal.status = p_status)
              and (
                  p_query is null
                  or proposal.commerce_offer_title ilike '%' || p_query || '%'
                  or proposal.commerce_offer_slug ilike '%' || p_query || '%'
                  or proposal.buyer_cms_user_id ilike '%' || p_query || '%'
                  or proposal.seller_cms_user_id ilike '%' || p_query || '%'
              )
        ), page as (
            select filtered.*
            from filtered
            order by filtered.created_at desc
            limit v_limit offset v_offset
        )
        select jsonb_build_object(
            'items', coalesce(
                (select jsonb_agg(to_jsonb(page) order by page.created_at desc) from page),
                '[]'::jsonb
            ),
            'total', (select count(*) from filtered)
        )
    );
end;
$$;

create or replace function commerce_negotiation.get_participant_proposal_detail(
    p_user_id text,
    p_id bigint default null,
    p_public_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
begin
    if p_user_id is null or btrim(p_user_id) = '' then
        raise exception 'unauthorized: CMS user identity required';
    end if;
    perform commerce_negotiation.expire_pending_proposals();
    select proposal.* into v_proposal
    from commerce_negotiation.proposals proposal
    where case when p_id is not null then proposal.id = p_id
        else proposal.public_id = p_public_id end
      and (proposal.buyer_cms_user_id = p_user_id or proposal.seller_cms_user_id = p_user_id)
    limit 1;
    if not found then return null; end if;
    return jsonb_build_object(
        'proposal', to_jsonb(v_proposal),
        'events', coalesce((
            select jsonb_agg(to_jsonb(event) order by event.created_at asc)
            from commerce_negotiation.proposal_events event
            where event.proposal_id = v_proposal.id
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function commerce_negotiation.get_admin_proposal_detail(
    p_id bigint default null,
    p_public_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select proposal.* into v_proposal
    from commerce_negotiation.proposals proposal
    where case when p_id is not null then proposal.id = p_id
        else proposal.public_id = p_public_id end
    limit 1;
    if not found then return null; end if;
    return jsonb_build_object(
        'proposal', to_jsonb(v_proposal),
        'events', coalesce((
            select jsonb_agg(to_jsonb(event) order by event.created_at asc)
            from commerce_negotiation.proposal_events event
            where event.proposal_id = v_proposal.id
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function commerce_negotiation.create_proposal(
    p_offer_id bigint,
    p_offer_slug text,
    p_offer_title text,
    p_seller_cms_user_id text,
    p_seller_display_name text,
    p_buyer_cms_user_id text,
    p_reference_amount bigint,
    p_proposed_amount bigint,
    p_currency text,
    p_buyer_message text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce_negotiation.settings%rowtype;
    v_proposal commerce_negotiation.proposals%rowtype;
    v_minimum bigint;
    v_maximum bigint;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select * into v_settings from commerce_negotiation.settings where id = 'default' for share;
    if not v_settings.enabled then raise exception 'conflict: price negotiation is disabled'; end if;
    if p_buyer_cms_user_id is null or btrim(p_buyer_cms_user_id) = '' then raise exception 'unauthorized: buyer identity required'; end if;
    if p_seller_cms_user_id = p_buyer_cms_user_id then raise exception 'forbidden: sellers cannot negotiate with themselves'; end if;
    if p_reference_amount is null or p_reference_amount <= 0 then raise exception 'validation: reference price must be positive'; end if;
    perform pg_advisory_xact_lock(hashtextextended('commerce_negotiation.offer:' || p_offer_id::text, 0));
    if exists (
        select 1 from commerce_negotiation.proposals
        where commerce_offer_id = p_offer_id and status = 'accepted'
    ) then
        raise exception 'conflict: this offer already has an accepted proposal';
    end if;
    v_minimum := ceil(
        p_reference_amount::numeric * v_settings.minimum_ratio_bps::numeric / 10000
    )::bigint;
    v_maximum := floor(
        p_reference_amount::numeric * v_settings.maximum_ratio_bps::numeric / 10000
    )::bigint;
    if p_proposed_amount < v_minimum or p_proposed_amount > v_maximum then
        raise exception 'validation: proposed amount must be between % and %', v_minimum, v_maximum;
    end if;

    begin
        insert into commerce_negotiation.proposals (
            commerce_offer_id, commerce_offer_slug, commerce_offer_title,
            seller_cms_user_id, seller_display_name, buyer_cms_user_id,
            reference_amount, minimum_amount, maximum_amount, proposed_amount,
            currency, buyer_message, expires_at
        ) values (
            p_offer_id, btrim(p_offer_slug), btrim(p_offer_title),
            p_seller_cms_user_id, coalesce(nullif(btrim(p_seller_display_name), ''), 'Seller'), p_buyer_cms_user_id,
            p_reference_amount, v_minimum, v_maximum, p_proposed_amount,
            lower(p_currency), nullif(btrim(p_buyer_message), ''),
            now() + make_interval(hours => v_settings.proposal_ttl_hours)
        ) returning * into v_proposal;
    exception when unique_violation then
        raise exception 'conflict: a pending proposal already exists for this buyer and offer';
    end;

    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, next_status,
        data
    ) values (
        v_proposal.id, 'created', 'buyer', p_buyer_cms_user_id, 'pending',
        jsonb_build_object('amount', p_proposed_amount, 'referenceAmount', p_reference_amount)
    );
    return to_jsonb(v_proposal);
end;
$$;

create or replace function commerce_negotiation.decide_proposal(
    p_proposal_id bigint,
    p_seller_cms_user_id text,
    p_action text,
    p_expected_version integer,
    p_message text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
    v_offer_id bigint;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select commerce_offer_id into v_offer_id
    from commerce_negotiation.proposals
    where id = p_proposal_id;
    if not found then raise exception 'not_found: proposal'; end if;
    perform pg_advisory_xact_lock(hashtextextended('commerce_negotiation.offer:' || v_offer_id::text, 0));
    select * into v_proposal from commerce_negotiation.proposals where id = p_proposal_id for update;
    if v_proposal.seller_cms_user_id <> p_seller_cms_user_id then raise exception 'forbidden: proposal does not belong to this seller'; end if;
    if v_proposal.version <> p_expected_version then raise exception 'conflict: stale proposal version'; end if;
    if v_proposal.status <> 'pending' then raise exception 'conflict: proposal is no longer pending'; end if;
    if p_action not in ('accept', 'reject') then raise exception 'validation: action must be accept or reject'; end if;

    if p_action = 'accept' then
        if exists (
            select 1
            from commerce_negotiation.proposals
            where commerce_offer_id = v_proposal.commerce_offer_id
                and status = 'accepted'
                and id <> v_proposal.id
        ) then
            raise exception 'conflict: this offer already has an accepted proposal';
        end if;
        with superseded as (
            update commerce_negotiation.proposals
            set status = 'superseded'
            where commerce_offer_id = v_proposal.commerce_offer_id
                and status = 'pending'
                and id <> v_proposal.id
            returning id
        )
        insert into commerce_negotiation.proposal_events (
            proposal_id, event_type, actor_kind, actor_id, previous_status, next_status
        )
        select id, 'superseded', 'seller', p_seller_cms_user_id, 'pending', 'superseded'
        from superseded;
        update commerce_negotiation.proposals
        set status = 'accepted', accepted_at = now(), decision_message = nullif(btrim(p_message), '')
        where id = v_proposal.id returning * into v_proposal;
    else
        update commerce_negotiation.proposals
        set status = 'rejected', rejected_at = now(), decision_message = nullif(btrim(p_message), '')
        where id = v_proposal.id returning * into v_proposal;
    end if;

    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, previous_status, next_status, data
    ) values (
        v_proposal.id, case when p_action = 'accept' then 'accepted' else 'rejected' end,
        'seller', p_seller_cms_user_id, 'pending', v_proposal.status,
        jsonb_build_object('message', p_message)
    );
    return to_jsonb(v_proposal);
end;
$$;

create or replace function commerce_negotiation.withdraw_proposal(
    p_proposal_id bigint,
    p_buyer_cms_user_id text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select * into v_proposal from commerce_negotiation.proposals where id = p_proposal_id for update;
    if not found then raise exception 'not_found: proposal'; end if;
    if v_proposal.buyer_cms_user_id <> p_buyer_cms_user_id then raise exception 'forbidden: proposal does not belong to this buyer'; end if;
    if v_proposal.version <> p_expected_version then raise exception 'conflict: stale proposal version'; end if;
    if v_proposal.status <> 'pending' then raise exception 'conflict: proposal is no longer pending'; end if;
    update commerce_negotiation.proposals
    set status = 'withdrawn', withdrawn_at = now()
    where id = v_proposal.id returning * into v_proposal;
    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, previous_status, next_status
    ) values (v_proposal.id, 'withdrawn', 'buyer', p_buyer_cms_user_id, 'pending', 'withdrawn');
    return to_jsonb(v_proposal);
end;
$$;

create or replace function commerce_negotiation.moderate_proposal(
    p_proposal_id bigint,
    p_admin_id text,
    p_expected_version integer,
    p_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
begin
    select * into v_proposal from commerce_negotiation.proposals where id = p_proposal_id for update;
    if not found then raise exception 'not_found: proposal'; end if;
    if v_proposal.version <> p_expected_version then raise exception 'conflict: stale proposal version'; end if;
    if v_proposal.status not in ('pending', 'accepted') then raise exception 'conflict: proposal cannot be canceled'; end if;
    update commerce_negotiation.proposals
    set status = 'canceled', decision_message = nullif(btrim(p_reason), '')
    where id = v_proposal.id returning * into v_proposal;
    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, previous_status, next_status, data
    ) values (
        v_proposal.id, 'canceled', 'admin', coalesce(nullif(btrim(p_admin_id), ''), 'cms-admin'),
        case when v_proposal.accepted_at is null then 'pending' else 'accepted' end, 'canceled',
        jsonb_build_object('reason', p_reason)
    );
    return to_jsonb(v_proposal);
end;
$$;

alter table commerce_negotiation.settings enable row level security;
alter table commerce_negotiation.settings force row level security;
alter table commerce_negotiation.proposals enable row level security;
alter table commerce_negotiation.proposals force row level security;
alter table commerce_negotiation.proposal_events enable row level security;
alter table commerce_negotiation.proposal_events force row level security;

revoke all on all tables in schema commerce_negotiation from public;
revoke all on all tables in schema commerce_negotiation from anon;
revoke all on all tables in schema commerce_negotiation from authenticated;
revoke all on all functions in schema commerce_negotiation from public;
revoke all on all functions in schema commerce_negotiation from anon;
revoke all on all functions in schema commerce_negotiation from authenticated;

grant usage on schema commerce_negotiation to service_role;
grant select, insert, update, delete on all tables in schema commerce_negotiation to service_role;
grant usage, select on all sequences in schema commerce_negotiation to service_role;
grant execute on all functions in schema commerce_negotiation to service_role;

alter default privileges in schema commerce_negotiation
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema commerce_negotiation
grant usage, select on sequences to service_role;
alter default privileges in schema commerce_negotiation
grant execute on functions to service_role;

comment on schema commerce_negotiation is
    'Private bounded price negotiation state for Commerce marketplace offers.';
comment on table commerce_negotiation.proposals is
    'Immutable offer and party snapshots plus the current negotiation decision state.';
comment on table commerce_negotiation.proposal_events is
    'Append-only negotiation lifecycle audit events.';

commit;
