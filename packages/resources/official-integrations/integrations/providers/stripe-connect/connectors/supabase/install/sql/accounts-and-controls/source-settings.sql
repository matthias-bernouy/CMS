create table if not exists stripe_connect.source_settings (
    id text primary key constraint source_settings_id_check check (id = 'default'),
    "values" jsonb not null default '{}'::jsonb,
    saved_revision text,
    applied_revision text,
    operation text not null default 'idle' constraint source_settings_operation_check check (operation in ('idle', 'applying', 'pending_sync', 'failed')),
    operation_id text,
    operation_started_at timestamptz,
    resources jsonb not null default '[]'::jsonb
);
alter table stripe_connect.source_settings enable row level security;
revoke all on stripe_connect.source_settings from public, anon, authenticated;
grant select, insert, update on stripe_connect.source_settings to service_role;
insert into stripe_connect.source_settings (id) values ('default') on conflict (id) do nothing;
