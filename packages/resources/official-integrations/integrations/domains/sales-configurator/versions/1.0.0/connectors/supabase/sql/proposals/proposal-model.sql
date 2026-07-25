create table if not exists sales_configurator.proposals (
    id bigint generated always as identity primary key,
    partner_account_id bigint not null constraint proposals_partner_account_fk
        references sales_configurator.partner_accounts(id) on delete restrict,
    client_id bigint not null,
    reference text not null default (
        'SC-' || pg_catalog.upper(
            pg_catalog.substr(
                pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
                1,
                12
            )
        )
    ),
    status text not null default 'draft',
    title text,
    introduction text,
    private_notes text,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp(),
    constraint proposals_reference_unique unique (reference),
    constraint proposals_partner_identity unique (id, partner_account_id),
    constraint proposals_client_partner_fk foreign key (client_id, partner_account_id)
        references sales_configurator.clients(id, partner_account_id) on delete restrict,
    constraint proposals_reference_not_blank check (
        pg_catalog.length(pg_catalog.btrim(reference)) > 0
        and pg_catalog.length(reference) <= 80
    ),
    constraint proposals_status_valid check (
        status in ('draft', 'shared', 'viewed', 'accepted', 'rejected', 'expired', 'archived')
    ),
    constraint proposals_title_bounded check (
        title is null or pg_catalog.length(title) <= 300
    ),
    constraint proposals_introduction_bounded check (
        introduction is null or pg_catalog.length(introduction) <= 20000
    ),
    constraint proposals_private_notes_bounded check (
        private_notes is null or pg_catalog.length(private_notes) <= 30000
    )
);

alter table sales_configurator.proposals
    add column if not exists partner_account_id bigint;

do $proposal_ownership_migration$
begin
    if exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = 'sales_configurator.proposals'::regclass
          and attribute.attname = 'owner_cms_user_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
    ) then
        execute $migration$
            update sales_configurator.proposals proposal
            set partner_account_id = partner.id
            from sales_configurator.partner_accounts partner
            where proposal.partner_account_id is null
              and partner.cms_user_id = proposal.owner_cms_user_id
        $migration$;
    end if;

    if exists (
        select 1
        from sales_configurator.proposals proposal
        where proposal.partner_account_id is null
    ) then
        raise exception
            'migration: every proposal owner must resolve to a partner account';
    end if;

    alter table sales_configurator.proposals
        alter column partner_account_id set not null;

    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposals'::regclass
          and constraint_state.conname = 'proposals_partner_account_fk'
    ) then
        alter table sales_configurator.proposals
            add constraint proposals_partner_account_fk
            foreign key (partner_account_id)
            references sales_configurator.partner_accounts(id)
            on delete restrict;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposals'::regclass
          and constraint_state.conname = 'proposals_partner_identity'
    ) then
        alter table sales_configurator.proposals
            add constraint proposals_partner_identity
            unique (id, partner_account_id);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposals'::regclass
          and constraint_state.conname = 'proposals_client_partner_fk'
    ) then
        alter table sales_configurator.proposals
            add constraint proposals_client_partner_fk
            foreign key (client_id, partner_account_id)
            references sales_configurator.clients(id, partner_account_id)
            on delete restrict;
    end if;
end;
$proposal_ownership_migration$;

create index if not exists proposals_partner_updated_idx
    on sales_configurator.proposals(partner_account_id, updated_at desc, id desc);

create index if not exists proposals_client_id_idx
    on sales_configurator.proposals(client_id);

create index if not exists proposals_status_updated_idx
    on sales_configurator.proposals(status, updated_at desc, id desc);

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

do $client_snapshot_constraints$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_registration_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_registration_bounded check (
                client_company_registration_number is null
                or pg_catalog.length(client_company_registration_number) <= 100
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_job_title_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_job_title_bounded check (
                client_contact_job_title is null
                or pg_catalog.length(client_contact_job_title) <= 200
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_address_line1_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_address_line1_bounded check (
                client_address_line1 is null
                or pg_catalog.length(client_address_line1) <= 300
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_address_line2_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_address_line2_bounded check (
                client_address_line2 is null
                or pg_catalog.length(client_address_line2) <= 300
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_postal_code_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_postal_code_bounded check (
                client_postal_code is null
                or pg_catalog.length(client_postal_code) <= 40
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_city_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_city_bounded check (
                client_city is null or pg_catalog.length(client_city) <= 200
            );
    end if;
    if not exists (
        select 1
        from pg_catalog.pg_constraint constraint_state
        where constraint_state.conrelid = 'sales_configurator.proposal_versions'::regclass
          and constraint_state.conname = 'proposal_versions_client_country_bounded'
    ) then
        alter table sales_configurator.proposal_versions
            add constraint proposal_versions_client_country_bounded check (
                client_country is null or pg_catalog.length(client_country) <= 100
            );
    end if;
end;
$client_snapshot_constraints$;

create unique index if not exists proposal_versions_one_draft_idx
    on sales_configurator.proposal_versions(proposal_id)
    where state = 'draft';

create unique index if not exists proposal_versions_one_published_idx
    on sales_configurator.proposal_versions(proposal_id)
    where state = 'published';

create index if not exists proposal_versions_proposal_created_idx
    on sales_configurator.proposal_versions(proposal_id, version_number desc);

drop trigger if exists proposals_set_updated_at on sales_configurator.proposals;
create trigger proposals_set_updated_at
before update on sales_configurator.proposals
for each row execute function sales_configurator.set_updated_at();

drop trigger if exists proposal_versions_set_updated_at
    on sales_configurator.proposal_versions;
create trigger proposal_versions_set_updated_at
before update on sales_configurator.proposal_versions
for each row execute function sales_configurator.set_updated_at();

drop trigger if exists protect_proposal_owner_cms_user_id
    on sales_configurator.proposals;
drop trigger if exists protect_proposal_partner_account_id
    on sales_configurator.proposals;
create trigger protect_proposal_partner_account_id
before update of partner_account_id on sales_configurator.proposals
for each row execute function sales_configurator.protect_partner_account_id();
