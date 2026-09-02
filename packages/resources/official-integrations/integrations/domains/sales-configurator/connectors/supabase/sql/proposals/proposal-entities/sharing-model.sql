create table if not exists sales_configurator.proposal_shares (
    id bigint generated always as identity primary key,
    proposal_version_id bigint not null
        references sales_configurator.proposal_versions(id) on delete cascade,
    token_hash text not null,
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    first_viewed_at timestamptz,
    last_viewed_at timestamptz,
    view_count bigint not null default 0,
    constraint proposal_shares_token_hash_unique unique (token_hash),
    constraint proposal_shares_version_identity unique (id, proposal_version_id),
    constraint proposal_shares_token_hash_sha256 check (
        token_hash = pg_catalog.lower(token_hash)
        and token_hash ~ '^[0-9a-f]{64}$'
    ),
    constraint proposal_shares_expiry_valid check (
        expires_at is null or expires_at > created_at
    ),
    constraint proposal_shares_revocation_valid check (
        revoked_at is null or revoked_at >= created_at
    ),
    constraint proposal_shares_views_valid check (
        view_count >= 0
        and (
            (view_count = 0 and first_viewed_at is null and last_viewed_at is null)
            or (
                view_count > 0
                and first_viewed_at is not null
                and last_viewed_at is not null
                and last_viewed_at >= first_viewed_at
            )
        )
    )
);

create index if not exists proposal_shares_version_created_idx
    on sales_configurator.proposal_shares(proposal_version_id, created_at desc, id desc);

create index if not exists proposal_shares_active_expiry_idx
    on sales_configurator.proposal_shares(expires_at)
    where revoked_at is null;

create table if not exists sales_configurator.proposal_events (
    id bigint generated always as identity primary key,
    proposal_id bigint not null
        references sales_configurator.proposals(id) on delete cascade,
    proposal_version_id bigint,
    share_id bigint,
    event_type text not null,
    actor_type text not null,
    actor_id text,
    metadata jsonb not null default '{}'::jsonb,
    occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
    constraint proposal_events_version_proposal_fk
        foreign key (proposal_version_id, proposal_id)
        references sales_configurator.proposal_versions(id, proposal_id)
        on delete cascade,
    constraint proposal_events_share_version_fk
        foreign key (share_id, proposal_version_id)
        references sales_configurator.proposal_shares(id, proposal_version_id)
        on delete cascade,
    constraint proposal_events_share_has_version check (
        share_id is null or proposal_version_id is not null
    ),
    constraint proposal_events_type_valid check (
        event_type in (
            'created',
            'draft_saved',
            'published',
            'share_created',
            'share_revoked',
            'viewed',
            'status_changed'
        )
    ),
    constraint proposal_events_actor_type_valid check (
        actor_type in ('admin', 'partner', 'client', 'system')
    ),
    constraint proposal_events_actor_consistent check (
        (actor_type in ('admin', 'partner') and actor_id is not null)
        or (actor_type in ('client', 'system') and actor_id is null)
    ),
    constraint proposal_events_actor_id_bounded check (
        actor_id is null
        or (
            pg_catalog.length(pg_catalog.btrim(actor_id)) > 0
            and pg_catalog.length(actor_id) <= 512
        )
    ),
    constraint proposal_events_metadata_object check (
        pg_catalog.jsonb_typeof(metadata) = 'object'
    ),
    constraint proposal_events_metadata_bounded check (
        pg_catalog.octet_length(metadata::text) <= 16384
    )
);

create index if not exists proposal_events_proposal_timeline_idx
    on sales_configurator.proposal_events(proposal_id, occurred_at desc, id desc);

create index if not exists proposal_events_version_id_idx
    on sales_configurator.proposal_events(proposal_version_id)
    where proposal_version_id is not null;

create index if not exists proposal_events_share_id_idx
    on sales_configurator.proposal_events(share_id)
    where share_id is not null;
