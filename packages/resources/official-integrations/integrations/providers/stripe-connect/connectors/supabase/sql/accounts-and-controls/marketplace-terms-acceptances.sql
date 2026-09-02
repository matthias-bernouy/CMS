
create table if not exists stripe_connect.marketplace_terms_versions (
    id uuid primary key default gen_random_uuid(),
    terms_version text not null,
    document_key text not null,
    label text not null,
    consent_text text not null,
    page_id text not null,
    page_path text not null,
    page_title text not null,
    page_description text not null,
    page_content text not null,
    page_snapshot jsonb not null,
    published_snapshot_url text not null,
    content_hash text not null,
    revision_hash text not null,
    created_by text not null,
    created_at timestamptz not null default now(),
    constraint marketplace_terms_versions_document_key_valid check (
        document_key ~ '^[a-z][a-z0-9_.-]{1,79}$'
    ),
    constraint marketplace_terms_versions_version_valid check (
        length(btrim(terms_version)) between 1 and 200
    ),
    constraint marketplace_terms_versions_label_valid check (
        length(btrim(label)) between 1 and 200
    ),
    constraint marketplace_terms_versions_consent_valid check (
        length(btrim(consent_text)) between 1 and 1000
    ),
    constraint marketplace_terms_versions_page_id_valid check (
        length(btrim(page_id)) between 1 and 512
    ),
    constraint marketplace_terms_versions_page_path_valid check (
        length(page_path) between 1 and 2048 and left(page_path, 1) = '/'
    ),
    constraint marketplace_terms_versions_page_title_valid check (
        length(btrim(page_title)) between 1 and 500
    ),
    constraint marketplace_terms_versions_page_description_valid check (
        length(page_description) <= 1000
    ),
    constraint marketplace_terms_versions_page_content_valid check (
        length(btrim(page_content)) > 0
    ),
    constraint marketplace_terms_versions_page_snapshot_valid check (
        jsonb_typeof(page_snapshot) = 'object'
    ),
    constraint marketplace_terms_versions_snapshot_url_valid check (
        length(btrim(published_snapshot_url)) between 1 and 4096
    ),
    constraint marketplace_terms_versions_content_hash_valid check (
        content_hash ~ '^[0-9a-f]{64}$'
    ),
    constraint marketplace_terms_versions_revision_hash_valid check (
        revision_hash ~ '^[0-9a-f]{64}$'
    ),
    constraint marketplace_terms_versions_actor_valid check (
        length(btrim(created_by)) between 1 and 200
    ),
    constraint marketplace_terms_versions_terms_version_unique unique (terms_version)
);

create unique index if not exists marketplace_terms_versions_acceptance_identity_idx
    on stripe_connect.marketplace_terms_versions (id, terms_version, content_hash);

create table if not exists stripe_connect.marketplace_terms_configuration (
    singleton boolean primary key default true,
    current_terms_version_id uuid references stripe_connect.marketplace_terms_versions(id),
    legacy_terms_version text,
    legacy_terms_hash text,
    updated_by text not null,
    updated_at timestamptz not null default now(),
    constraint marketplace_terms_configuration_singleton check (singleton),
    constraint marketplace_terms_configuration_mode check (
        (
            current_terms_version_id is not null
            and legacy_terms_version is null
            and legacy_terms_hash is null
        )
        or (
            current_terms_version_id is null
            and length(btrim(legacy_terms_version)) between 1 and 200
            and legacy_terms_hash ~ '^[0-9a-f]{64}$'
        )
    ),
    constraint marketplace_terms_configuration_actor_valid check (
        length(btrim(updated_by)) between 1 and 200
    )
);

create table if not exists stripe_connect.marketplace_terms_acceptances (
    cms_user_id text not null references stripe_connect.accounts(cms_user_id),
    terms_version text not null,
    terms_hash text not null,
    accepted_at timestamptz not null default now(),
    primary key (cms_user_id, terms_version),
    constraint marketplace_terms_acceptances_user_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint marketplace_terms_acceptances_version_valid check (
        length(btrim(terms_version)) between 1 and 200
    ),
    constraint marketplace_terms_acceptances_hash_valid check (terms_hash ~ '^[0-9a-f]{64}$')
);

alter table stripe_connect.marketplace_terms_acceptances
    add column if not exists terms_version_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conname = 'marketplace_terms_acceptances_version_evidence_fkey'
          and conrelid = 'stripe_connect.marketplace_terms_acceptances'::regclass
    ) then
        alter table stripe_connect.marketplace_terms_acceptances
            add constraint marketplace_terms_acceptances_version_evidence_fkey
            foreign key (terms_version_id, terms_version, terms_hash)
            references stripe_connect.marketplace_terms_versions (id, terms_version, content_hash)
            not valid;
    end if;
end;
$$;

do $$
begin
    if exists (
        select 1
        from pg_catalog.pg_constraint
        where conname = 'marketplace_terms_acceptances_version_evidence_fkey'
          and conrelid = 'stripe_connect.marketplace_terms_acceptances'::regclass
          and not convalidated
    ) then
        alter table stripe_connect.marketplace_terms_acceptances
            validate constraint marketplace_terms_acceptances_version_evidence_fkey;
    end if;
end;
$$;
