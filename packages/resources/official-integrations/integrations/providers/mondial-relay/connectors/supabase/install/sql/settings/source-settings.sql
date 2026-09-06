create table if not exists delivery.source_settings (
    id text primary key check (id = 'default'),
    "values" jsonb not null default '{}'::jsonb,
    saved_revision text,
    applied_revision text,
    operation text not null default 'idle' check (operation in ('idle', 'applying', 'pending_sync', 'failed')),
    resources jsonb not null default '[]'::jsonb
);
alter table delivery.source_settings enable row level security;
revoke all on delivery.source_settings from public, anon, authenticated;
grant select, insert, update on delivery.source_settings to service_role;
insert into delivery.source_settings (id) values ('default') on conflict (id) do nothing;
