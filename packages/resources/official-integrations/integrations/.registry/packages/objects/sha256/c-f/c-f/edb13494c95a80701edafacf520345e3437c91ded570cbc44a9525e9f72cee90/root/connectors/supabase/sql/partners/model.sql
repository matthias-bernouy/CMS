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
        and cms_user_id = pg_catalog.btrim(cms_user_id)
        and cms_user_id !~ '[[:cntrl:]]'
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

alter table sales_configurator.partner_accounts
    drop constraint if exists partner_accounts_cms_user_id_not_blank,
    add constraint partner_accounts_cms_user_id_not_blank check (
        pg_catalog.length(pg_catalog.btrim(cms_user_id)) > 0
        and pg_catalog.length(cms_user_id) <= 512
        and cms_user_id = pg_catalog.btrim(cms_user_id)
        and cms_user_id !~ '[[:cntrl:]]'
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
    partner_account_id bigint not null constraint clients_partner_account_fk
        references sales_configurator.partner_accounts(id) on delete restrict,
    company_name text not null,
    company_registration_number text,
    contact_name text not null,
    contact_job_title text,
    contact_email text not null,
    contact_phone text,
    address_line1 text,
    address_line2 text,
    postal_code text,
    city text,
    country text,
    notes text,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp(),
    constraint clients_partner_identity unique (id, partner_account_id),
    constraint clients_company_name_not_blank check (
        pg_catalog.length(pg_catalog.btrim(company_name)) > 0
        and pg_catalog.length(company_name) <= 200
    ),
    constraint clients_registration_number_bounded check (
        company_registration_number is null
        or pg_catalog.length(company_registration_number) <= 100
    ),
    constraint clients_contact_name_not_blank check (
        pg_catalog.length(pg_catalog.btrim(contact_name)) > 0
        and pg_catalog.length(contact_name) <= 200
    ),
    constraint clients_contact_job_title_bounded check (
        contact_job_title is null or pg_catalog.length(contact_job_title) <= 200
    ),
    constraint clients_contact_email_not_blank check (
        pg_catalog.length(pg_catalog.btrim(contact_email)) > 0
        and pg_catalog.length(contact_email) <= 320
    ),
    constraint clients_contact_phone_bounded check (
        contact_phone is null or pg_catalog.length(contact_phone) <= 80
    ),
    constraint clients_address_line1_bounded check (
        address_line1 is null or pg_catalog.length(address_line1) <= 300
    ),
    constraint clients_address_line2_bounded check (
        address_line2 is null or pg_catalog.length(address_line2) <= 300
    ),
    constraint clients_postal_code_bounded check (
        postal_code is null or pg_catalog.length(postal_code) <= 40
    ),
    constraint clients_city_bounded check (
        city is null or pg_catalog.length(city) <= 200
    ),
    constraint clients_country_bounded check (
        country is null or pg_catalog.length(country) <= 100
    ),
    constraint clients_notes_bounded check (notes is null or pg_catalog.length(notes) <= 20000)
);

alter table sales_configurator.clients
    add column if not exists partner_account_id bigint,
    add column if not exists company_registration_number text,
    add column if not exists contact_job_title text,
    add column if not exists address_line1 text,
    add column if not exists address_line2 text,
    add column if not exists postal_code text,
    add column if not exists city text,
    add column if not exists country text;

do $client_ownership_migration$
begin
    if exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = 'sales_configurator.clients'::regclass
          and attribute.attname = 'owner_cms_user_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
    ) then
        execute $migration$
            update sales_configurator.clients client
            set partner_account_id = partner.id
            from sales_configurator.partner_accounts partner
            where client.partner_account_id is null
              and partner.cms_user_id = client.owner_cms_user_id
        $migration$;
    end if;

    if exists (
        select 1
        from sales_configurator.clients client
        where client.partner_account_id is null
    ) then
        raise exception
            'migration: every client owner must resolve to a partner account';
    end if;

    alter table sales_configurator.clients
        alter column partner_account_id set not null;

    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_partner_account_fk'
    ) then
        alter table sales_configurator.clients
            add constraint clients_partner_account_fk
            foreign key (partner_account_id)
            references sales_configurator.partner_accounts(id)
            on delete restrict;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.clients'::regclass
          and constraint_state.conname = 'clients_partner_identity'
    ) then
        alter table sales_configurator.clients
            add constraint clients_partner_identity
            unique (id, partner_account_id);
    end if;
end;
$client_ownership_migration$;
