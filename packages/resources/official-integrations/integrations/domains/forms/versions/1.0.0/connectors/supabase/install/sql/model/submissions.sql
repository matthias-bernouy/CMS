create table if not exists forms.submissions (
    id bigint generated always as identity primary key,
    receipt_id uuid not null default gen_random_uuid(),
    form_id bigint not null,
    form_version integer not null,
    idempotency_key text not null,
    session_id uuid not null,
    answers jsonb not null,
    status text not null default 'received',
    submitted_by text,
    metadata jsonb not null default '{}'::jsonb,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint submissions_receipt_id_unique unique (receipt_id),
    constraint submissions_idempotency_unique unique (form_id, idempotency_key),
    constraint submissions_form_version_fk foreign key (form_id, form_version)
        references forms.form_versions(form_id, version_number) on delete restrict,
    constraint submissions_form_version_valid check (form_version > 0),
    constraint submissions_idempotency_length check (length(idempotency_key) between 16 and 200),
    constraint submissions_answers_object check (jsonb_typeof(answers) = 'object'),
    constraint submissions_answers_size check (pg_column_size(answers) <= 1048576),
    constraint submissions_status_valid check (status in ('received', 'reviewed', 'archived')),
    constraint submissions_actor_length check (
        (submitted_by is null or length(submitted_by) <= 200)
        and (updated_by is null or length(updated_by) <= 200)
    ),
    constraint submissions_metadata_object check (jsonb_typeof(metadata) = 'object'),
    constraint submissions_metadata_size check (pg_column_size(metadata) <= 16384)
);

create index if not exists submissions_form_created_idx
    on forms.submissions(form_id, created_at desc, id desc);
create index if not exists submissions_form_version_idx
    on forms.submissions(form_id, form_version);
create index if not exists submissions_retention_idx
    on forms.submissions(created_at, id);
create index if not exists submissions_received_created_idx
    on forms.submissions(created_at, id)
    where status = 'received';
create index if not exists submissions_status_created_idx
    on forms.submissions(status, created_at desc, id desc);

drop trigger if exists submissions_touch_updated_at on forms.submissions;
create trigger submissions_touch_updated_at
before update on forms.submissions
for each row execute function forms.touch_updated_at();
