create table if not exists consent.acceptance_intents (
    context_key text not null
        references consent.contexts(context_key) on delete restrict,
    attempt_id uuid not null,
    subject_claim_hash text not null,
    accepted_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '15 minutes'),
    primary key (context_key, attempt_id),
    constraint consent_intent_claim_hash check (subject_claim_hash ~ '^[a-f0-9]{64}$'),
    constraint consent_intent_expiry check (expires_at > accepted_at)
);

create table if not exists consent.acceptance_intent_documents (
    context_key text not null,
    attempt_id uuid not null,
    document_key text not null,
    version_id text not null,
    content_hash text not null,
    primary key (context_key, attempt_id, document_key),
    foreign key (context_key, attempt_id)
        references consent.acceptance_intents(context_key, attempt_id) on delete cascade,
    foreign key (context_key, document_key, version_id, content_hash)
        references consent.document_versions(context_key, document_key, version_id, content_hash)
        on delete restrict
);

create table if not exists consent.acceptances (
    id uuid primary key default extensions.gen_random_uuid(),
    context_key text not null
        references consent.contexts(context_key) on delete restrict,
    attempt_id uuid not null,
    cms_user_id text not null,
    subject_claim_hash text not null,
    accepted_at timestamptz not null,
    committed_at timestamptz not null default now(),
    constraint consent_acceptances_context_attempt_key
        unique (context_key, attempt_id),
    constraint consent_acceptances_id_context_key
        unique (id, context_key),
    constraint consent_acceptance_user_id
        check (length(btrim(cms_user_id)) between 1 and 512),
    constraint consent_acceptance_claim_hash check (subject_claim_hash ~ '^[a-f0-9]{64}$'),
    constraint consent_acceptance_time_order check (committed_at >= accepted_at)
);

create table if not exists consent.acceptance_documents (
    acceptance_id uuid not null,
    context_key text not null,
    document_key text not null,
    version_id text not null,
    content_hash text not null,
    primary key (acceptance_id, document_key),
    foreign key (acceptance_id, context_key)
        references consent.acceptances(id, context_key) on delete restrict,
    foreign key (context_key, document_key, version_id, content_hash)
        references consent.document_versions(context_key, document_key, version_id, content_hash)
        on delete restrict
);

create index if not exists consent_acceptances_subject_idx
    on consent.acceptances(cms_user_id, committed_at desc, id desc);
create index if not exists consent_acceptances_context_idx
    on consent.acceptances(context_key, committed_at desc, id desc);
create index if not exists consent_acceptances_committed_idx
    on consent.acceptances(committed_at desc, id desc);
create index if not exists consent_intents_expiry_idx
    on consent.acceptance_intents(expires_at);
create index if not exists consent_intent_documents_version_idx
    on consent.acceptance_intent_documents(
        context_key, document_key, version_id, content_hash
    );
create index if not exists consent_acceptance_documents_version_idx
    on consent.acceptance_documents(
        context_key, document_key, version_id, content_hash
    );
