create table if not exists sales_configurator.partner_accounts (
    id bigint generated always as identity primary key,
    cms_user_id text not null,
    status text not null default 'active',
    display_name text not null,
    contact_email text,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp(),
    constraint partner_accounts_cms_user_id_unique unique (cms_user_id),
    constraint partner_accounts_cms_user_id_not_blank check (
        pg_catalog.length(pg_catalog.btrim(cms_user_id)) > 0
        and pg_catalog.length(cms_user_id) <= 512
    ),
    constraint partner_accounts_status_valid check (status in ('active', 'suspended')),
    constraint partner_accounts_display_name_not_blank check (
        pg_catalog.length(pg_catalog.btrim(display_name)) > 0
        and pg_catalog.length(display_name) <= 200
    ),
    constraint partner_accounts_contact_email_bounded check (
        contact_email is null or pg_catalog.length(contact_email) <= 320
    )
);

create table if not exists sales_configurator.partner_capabilities (
    partner_account_id bigint not null
        references sales_configurator.partner_accounts(id) on delete cascade,
    capability text not null,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    primary key (partner_account_id, capability),
    constraint partner_capabilities_value_valid check (
        capability in (
            'clients.manage',
            'proposals.manage',
            'proposals.publish',
            'proposals.share'
        )
    )
);

create table if not exists sales_configurator.clients (
    id bigint generated always as identity primary key,
    owner_cms_user_id text not null
        references sales_configurator.partner_accounts(cms_user_id) on delete restrict,
    company_name text not null,
    contact_name text not null,
    contact_email text not null,
    contact_phone text,
    notes text,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp(),
    constraint clients_owner_identity unique (id, owner_cms_user_id),
    constraint clients_company_name_not_blank check (
        pg_catalog.length(pg_catalog.btrim(company_name)) > 0
        and pg_catalog.length(company_name) <= 200
    ),
    constraint clients_contact_name_not_blank check (
        pg_catalog.length(pg_catalog.btrim(contact_name)) > 0
        and pg_catalog.length(contact_name) <= 200
    ),
    constraint clients_contact_email_not_blank check (
        pg_catalog.length(pg_catalog.btrim(contact_email)) > 0
        and pg_catalog.length(contact_email) <= 320
    ),
    constraint clients_contact_phone_bounded check (
        contact_phone is null or pg_catalog.length(contact_phone) <= 80
    ),
    constraint clients_notes_bounded check (notes is null or pg_catalog.length(notes) <= 20000)
);

create index if not exists clients_owner_updated_idx
    on sales_configurator.clients(owner_cms_user_id, updated_at desc, id desc);

drop trigger if exists partner_accounts_set_updated_at on sales_configurator.partner_accounts;
create trigger partner_accounts_set_updated_at
before update on sales_configurator.partner_accounts
for each row execute function sales_configurator.set_updated_at();

drop trigger if exists clients_set_updated_at on sales_configurator.clients;
create trigger clients_set_updated_at
before update on sales_configurator.clients
for each row execute function sales_configurator.set_updated_at();
