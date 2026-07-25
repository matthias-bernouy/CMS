create table if not exists sales_configurator.proposals (
    id bigint generated always as identity primary key,
    owner_cms_user_id text not null
        references sales_configurator.partner_accounts(cms_user_id) on delete restrict,
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
    constraint proposals_owner_identity unique (id, owner_cms_user_id),
    constraint proposals_client_owner_fk foreign key (client_id, owner_cms_user_id)
        references sales_configurator.clients(id, owner_cms_user_id) on delete restrict,
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

create index if not exists proposals_owner_updated_idx
    on sales_configurator.proposals(owner_cms_user_id, updated_at desc, id desc);

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
    client_contact_name text not null,
    client_contact_email text not null,
    client_contact_phone text,
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
    constraint proposal_versions_client_contact_not_blank check (
        pg_catalog.length(pg_catalog.btrim(client_contact_name)) > 0
        and pg_catalog.length(client_contact_name) <= 200
    ),
    constraint proposal_versions_client_email_not_blank check (
        pg_catalog.length(pg_catalog.btrim(client_contact_email)) > 0
        and pg_catalog.length(client_contact_email) <= 320
    ),
    constraint proposal_versions_client_phone_bounded check (
        client_contact_phone is null
        or pg_catalog.length(client_contact_phone) <= 80
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
create trigger protect_proposal_owner_cms_user_id
before update of owner_cms_user_id on sales_configurator.proposals
for each row execute function sales_configurator.protect_owner_cms_user_id();
