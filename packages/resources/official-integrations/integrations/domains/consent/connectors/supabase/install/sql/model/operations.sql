create table if not exists consent.operation_acceptances (
    context_key text not null,
    operation_key text not null,
    acceptance_id uuid not null,
    cms_user_id text not null,
    metadata jsonb not null default '{}'::jsonb,
    primary key (context_key, operation_key),
    foreign key (acceptance_id, context_key)
        references consent.acceptances(id, context_key) on delete restrict,
    constraint consent_operation_key_length
        check (length(btrim(operation_key)) between 1 and 512),
    constraint consent_operation_subject_length
        check (length(btrim(cms_user_id)) between 1 and 512),
    constraint consent_operation_metadata_object
        check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 8192)
);

create index if not exists consent_operation_acceptance_idx
    on consent.operation_acceptances(acceptance_id, context_key);
create index if not exists consent_operation_subject_idx
    on consent.operation_acceptances(cms_user_id, context_key);

alter table consent.operation_acceptances enable row level security;
alter table consent.operation_acceptances force row level security;
