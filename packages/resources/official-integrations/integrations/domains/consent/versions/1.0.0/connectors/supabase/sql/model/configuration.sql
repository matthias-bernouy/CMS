create table if not exists consent.contexts (
    context_key text primary key,
    enabled boolean not null default true,
    approved_snapshot_origin text,
    configured_by text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint consent_context_key_format
        check (context_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
    constraint consent_context_actor_not_blank
        check (length(btrim(configured_by)) between 1 and 512),
    constraint consent_context_origin check (
        approved_snapshot_origin is null
        or (
            length(approved_snapshot_origin) <= 2048
            and approved_snapshot_origin ~ '^https?://[^/]+$'
        )
    )
);

create table if not exists consent.documents (
    context_key text not null
        references consent.contexts(context_key) on delete restrict,
    document_key text not null,
    enabled boolean not null default true,
    sort_order integer not null default 0,
    label text not null,
    consent_text text not null,
    cms_page_id text not null,
    published_snapshot_url text not null,
    current_version_id text,
    configured_by text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (context_key, document_key),
    constraint consent_document_key_format
        check (document_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
    constraint consent_document_sort_order check (sort_order >= 0),
    constraint consent_document_label
        check (length(btrim(label)) between 1 and 200),
    constraint consent_document_text
        check (length(btrim(consent_text)) between 1 and 1000),
    constraint consent_document_text_contains_label
        check (strpos(consent_text, label) > 0),
    constraint consent_document_page_id
        check (length(btrim(cms_page_id)) between 1 and 512),
    constraint consent_document_snapshot_url
        check (length(published_snapshot_url) between 1 and 4096),
    constraint consent_document_actor_not_blank
        check (length(btrim(configured_by)) between 1 and 512)
);

create table if not exists consent.document_versions (
    context_key text not null,
    document_key text not null,
    version_id text not null,
    label text not null,
    consent_text text not null,
    cms_page_id text not null,
    page_path text not null,
    page_title text not null,
    page_description text not null,
    page_content text not null,
    page_snapshot jsonb not null,
    published_snapshot_url text not null,
    content_hash text not null,
    materialized_by text not null,
    materialized_at timestamptz not null default now(),
    primary key (context_key, document_key, version_id),
    foreign key (context_key, document_key)
        references consent.documents(context_key, document_key) on delete restrict,
    constraint consent_version_id_hash check (version_id ~ '^[a-f0-9]{64}$'),
    constraint consent_version_content_hash check (content_hash ~ '^[a-f0-9]{64}$'),
    constraint consent_version_path check (
        page_path like '/%'
        and page_path not like '//%'
        and strpos(page_path, chr(92)) = 0
        and page_path !~ '[[:cntrl:]]'
    ),
    constraint consent_version_snapshot_url
        check (length(published_snapshot_url) between 1 and 4096),
    constraint consent_version_snapshot_object check (jsonb_typeof(page_snapshot) = 'object'),
    constraint consent_version_content_size check (octet_length(page_content) <= 2000000),
    constraint consent_version_text_contains_label
        check (strpos(consent_text, label) > 0),
    constraint consent_version_actor_not_blank
        check (length(btrim(materialized_by)) between 1 and 512),
    unique (context_key, document_key, version_id, content_hash)
);

alter table consent.documents
    drop constraint if exists consent_documents_current_version_fkey;
alter table consent.documents
    add constraint consent_documents_current_version_fkey
    foreign key (context_key, document_key, current_version_id)
    references consent.document_versions(context_key, document_key, version_id)
    on delete restrict;

create index if not exists consent_documents_current_version_idx
    on consent.documents(context_key, current_version_id)
    where current_version_id is not null;
