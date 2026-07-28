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
