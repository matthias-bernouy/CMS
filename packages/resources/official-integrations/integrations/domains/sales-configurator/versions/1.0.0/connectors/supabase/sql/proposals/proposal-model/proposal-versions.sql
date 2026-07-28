
create table if not exists sales_configurator.proposal_versions (
    id bigint generated always as identity primary key,
    proposal_id bigint not null
        references sales_configurator.proposals(id) on delete cascade,
    version_number integer not null,
    revision bigint not null default 0,
    state text not null default 'draft',
    currency text not null default 'EUR',
    fixed_total_cents bigint not null default 0,
    quote_item_count integer not null default 0,
    public_title text,
    public_introduction text,
    client_company_name text not null,
    client_company_registration_number text,
    client_contact_name text not null,
    client_contact_job_title text,
    client_contact_email text not null,
    client_contact_phone text,
    client_address_line1 text,
    client_address_line2 text,
    client_postal_code text,
    client_city text,
    client_country text,
    sales_contact_name text not null,
    sales_contact_email text,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp(),
    published_at timestamptz,
    constraint proposal_versions_number_unique unique (proposal_id, version_number),
    constraint proposal_versions_proposal_identity unique (id, proposal_id),
    constraint proposal_versions_number_positive check (version_number > 0),
    constraint proposal_versions_revision_valid check (revision >= 0),
    constraint proposal_versions_state_valid check (
        state in ('draft', 'published', 'superseded')
    ),
    constraint proposal_versions_currency_eur check (currency = 'EUR'),
    constraint proposal_versions_total_valid check (
        fixed_total_cents between 0 and 999999999999999999
    ),
    constraint proposal_versions_quote_count_valid check (
        quote_item_count between 0 and 100000
    ),
    constraint proposal_versions_title_bounded check (
        public_title is null or pg_catalog.length(public_title) <= 300
    ),
    constraint proposal_versions_introduction_bounded check (
        public_introduction is null
        or pg_catalog.length(public_introduction) <= 20000
    ),
    constraint proposal_versions_client_company_not_blank check (
        pg_catalog.length(pg_catalog.btrim(client_company_name)) > 0
        and pg_catalog.length(client_company_name) <= 200
    ),
    constraint proposal_versions_client_registration_bounded check (
        client_company_registration_number is null
        or pg_catalog.length(client_company_registration_number) <= 100
    ),
    constraint proposal_versions_client_contact_not_blank check (
        pg_catalog.length(pg_catalog.btrim(client_contact_name)) > 0
        and pg_catalog.length(client_contact_name) <= 200
    ),
    constraint proposal_versions_client_job_title_bounded check (
        client_contact_job_title is null
        or pg_catalog.length(client_contact_job_title) <= 200
    ),
    constraint proposal_versions_client_email_not_blank check (
        pg_catalog.length(pg_catalog.btrim(client_contact_email)) > 0
        and pg_catalog.length(client_contact_email) <= 320
    ),
    constraint proposal_versions_client_phone_bounded check (
        client_contact_phone is null
        or pg_catalog.length(client_contact_phone) <= 80
    ),
    constraint proposal_versions_client_address_line1_bounded check (
        client_address_line1 is null
        or pg_catalog.length(client_address_line1) <= 300
    ),
    constraint proposal_versions_client_address_line2_bounded check (
        client_address_line2 is null
        or pg_catalog.length(client_address_line2) <= 300
    ),
    constraint proposal_versions_client_postal_code_bounded check (
        client_postal_code is null
        or pg_catalog.length(client_postal_code) <= 40
    ),
    constraint proposal_versions_client_city_bounded check (
        client_city is null or pg_catalog.length(client_city) <= 200
    ),
    constraint proposal_versions_client_country_bounded check (
        client_country is null or pg_catalog.length(client_country) <= 100
    ),
    constraint proposal_versions_sales_contact_not_blank check (
        pg_catalog.length(pg_catalog.btrim(sales_contact_name)) > 0
        and pg_catalog.length(sales_contact_name) <= 200
    ),
    constraint proposal_versions_sales_email_bounded check (
        sales_contact_email is null
        or pg_catalog.length(sales_contact_email) <= 320
    ),
    constraint proposal_versions_publication_consistent check (
        (state = 'draft' and published_at is null)
        or (state in ('published', 'superseded') and published_at is not null)
    )
);

alter table sales_configurator.proposal_versions
    add column if not exists revision bigint not null default 0;

alter table sales_configurator.proposal_versions
    add column if not exists client_company_registration_number text,
    add column if not exists client_contact_job_title text,
    add column if not exists client_address_line1 text,
    add column if not exists client_address_line2 text,
    add column if not exists client_postal_code text,
    add column if not exists client_city text,
    add column if not exists client_country text;

do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_revision_valid'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_revision_valid check (revision >= 0);
    end if;
end;
$$;
