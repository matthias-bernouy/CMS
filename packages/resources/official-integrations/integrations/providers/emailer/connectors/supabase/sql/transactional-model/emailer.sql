

create schema if not exists emailer;

revoke all on schema emailer from public;
revoke all on schema emailer from anon;
revoke all on schema emailer from authenticated;

create table if not exists emailer.templates (
    key text primary key,
    name text not null,
    status text not null default 'draft',
    from_email text,
    reply_to text,
    subject text not null,
    html_body text not null,
    text_body text,
    required_tokens jsonb not null default '[]'::jsonb,
    sample_data jsonb not null default '{}'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint emailer_templates_key_format check (key ~ '^[a-z0-9][a-z0-9_.-]{1,120}$'),
    constraint emailer_templates_name_not_blank check (length(btrim(name)) > 0),
    constraint emailer_templates_status_valid check (status in ('draft', 'active', 'archived')),
    constraint emailer_templates_subject_not_blank check (length(btrim(subject)) > 0),
    constraint emailer_templates_html_body_not_blank check (length(btrim(html_body)) > 0),
    constraint emailer_templates_required_tokens_array check (jsonb_typeof(required_tokens) = 'array'),
    constraint emailer_templates_sample_data_object check (jsonb_typeof(sample_data) = 'object'),
    constraint emailer_templates_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists emailer.messages (
    id text primary key,
    template_key text references emailer.templates(key) on delete set null,
    status text not null,
    to_emails jsonb not null default '[]'::jsonb,
    cc_emails jsonb not null default '[]'::jsonb,
    bcc_emails jsonb not null default '[]'::jsonb,
    from_email text not null,
    reply_to text,
    subject text not null,
    html_body text not null,
    text_body text,
    data_snapshot jsonb not null default '{}'::jsonb,
    provider_message_id text,
    error text,
    idempotency_key text,
    reservation_token text,
    created_at timestamptz not null default now(),
    sent_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint emailer_messages_id_not_blank check (length(btrim(id)) > 0),
    constraint emailer_messages_status_valid check (
        status in ('reserved', 'sending', 'sent', 'failed', 'unknown')
    ),
    constraint emailer_messages_to_emails_array check (jsonb_typeof(to_emails) = 'array'),
    constraint emailer_messages_cc_emails_array check (jsonb_typeof(cc_emails) = 'array'),
    constraint emailer_messages_bcc_emails_array check (jsonb_typeof(bcc_emails) = 'array'),
    constraint emailer_messages_subject_not_blank check (length(btrim(subject)) > 0),
    constraint emailer_messages_html_body_not_blank check (length(btrim(html_body)) > 0),
    constraint emailer_messages_data_snapshot_object check (jsonb_typeof(data_snapshot) = 'object'),
    constraint emailer_messages_idempotency_key_not_blank check (
        idempotency_key is null or length(btrim(idempotency_key)) > 0
    )
);

alter table emailer.messages
    add column if not exists reservation_token text;
alter table emailer.messages
    drop constraint if exists emailer_messages_status_valid;
alter table emailer.messages
    add constraint emailer_messages_status_valid check (
        status in ('reserved', 'sending', 'sent', 'failed', 'unknown')
    );

create table if not exists emailer.settings (
    id text primary key default 'default',
    smtp_host text,
    smtp_port integer,
    smtp_secure boolean,
    smtp_user text,
    smtp_password text,
    default_from text,
    default_reply_to text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint emailer_settings_id_default check (id = 'default'),
    constraint emailer_settings_smtp_port_valid check (
        smtp_port is null or (smtp_port > 0 and smtp_port <= 65535)
    ),
    constraint emailer_settings_default_from_email check (
        default_from is null or default_from = '' or default_from ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
    constraint emailer_settings_default_reply_to_email check (
        default_reply_to is null or default_reply_to = '' or default_reply_to ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
);

insert into emailer.settings (id)
values ('default')
on conflict (id) do nothing;

create unique index if not exists emailer_messages_idempotency_key_idx
    on emailer.messages(idempotency_key)
    where idempotency_key is not null;

create index if not exists emailer_templates_status_updated_idx
    on emailer.templates(status, updated_at desc);

create index if not exists emailer_messages_template_created_idx
    on emailer.messages(template_key, created_at desc);

create index if not exists emailer_messages_status_created_idx
    on emailer.messages(status, created_at desc);

alter table emailer.settings add column if not exists saved_revision text;
alter table emailer.settings add column if not exists applied_revision text;
alter table emailer.settings add column if not exists operation text not null default 'idle';
