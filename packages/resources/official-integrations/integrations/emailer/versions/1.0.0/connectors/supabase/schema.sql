-- Supabase emailer schema for CMS-backed transactional email templates.
--
-- Emailer owns templates and delivery audit rows only. Campaigns, inbound
-- email, bounce processing, unsubscribe management, and attachments are out of
-- scope for version 1.0.0.

begin;

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
    created_at timestamptz not null default now(),
    sent_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint emailer_messages_id_not_blank check (length(btrim(id)) > 0),
    constraint emailer_messages_status_valid check (status in ('sent', 'failed')),
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

create unique index if not exists emailer_messages_idempotency_key_idx
    on emailer.messages(idempotency_key)
    where idempotency_key is not null;

create index if not exists emailer_templates_status_updated_idx
    on emailer.templates(status, updated_at desc);

create index if not exists emailer_messages_template_created_idx
    on emailer.messages(template_key, created_at desc);

create index if not exists emailer_messages_status_created_idx
    on emailer.messages(status, created_at desc);

create or replace function emailer.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists emailer_templates_set_updated_at on emailer.templates;
create trigger emailer_templates_set_updated_at
before update on emailer.templates
for each row execute function emailer.set_updated_at();

drop trigger if exists emailer_messages_set_updated_at on emailer.messages;
create trigger emailer_messages_set_updated_at
before update on emailer.messages
for each row execute function emailer.set_updated_at();

alter table emailer.templates enable row level security;
alter table emailer.templates force row level security;
alter table emailer.messages enable row level security;
alter table emailer.messages force row level security;

revoke all on all tables in schema emailer from public;
revoke all on all tables in schema emailer from anon;
revoke all on all tables in schema emailer from authenticated;
revoke all on all sequences in schema emailer from public;
revoke all on all sequences in schema emailer from anon;
revoke all on all sequences in schema emailer from authenticated;
revoke all on all functions in schema emailer from public;
revoke all on all functions in schema emailer from anon;
revoke all on all functions in schema emailer from authenticated;

grant usage on schema emailer to service_role;
grant select, insert, update, delete on all tables in schema emailer to service_role;
grant usage, select on all sequences in schema emailer to service_role;
grant execute on all functions in schema emailer to service_role;

alter default privileges in schema emailer
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema emailer
grant usage, select on sequences to service_role;
alter default privileges in schema emailer
grant execute on functions to service_role;

comment on schema emailer is
    'Private transactional email templates and delivery audit rows owned by Supabase Edge Functions.';
comment on table emailer.templates is
    'Transactional templates rendered by cms-emailer.';
comment on table emailer.messages is
    'Delivery audit rows written by cms-emailer.';

commit;
