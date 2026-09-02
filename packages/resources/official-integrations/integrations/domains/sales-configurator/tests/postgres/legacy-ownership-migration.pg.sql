\if :{?cms_integration_schema_bundle}
\else
    \echo 'cms_integration_schema_bundle must point to the assembled Sales Configurator SQL bundle.'
    \quit 3
\endif

\if :{?allow_sales_configurator_schema_reset}
\else
    \echo 'Set allow_sales_configurator_schema_reset=true on a disposable database.'
    \quit 3
\endif
\if :allow_sales_configurator_schema_reset
\else
    \echo 'allow_sales_configurator_schema_reset must be true.'
    \quit 3
\endif

\set ON_ERROR_STOP on
set statement_timeout = '20s';

do $roles$
begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end;
$roles$;

alter role service_role bypassrls;
drop schema if exists sales_configurator cascade;
\ir :cms_integration_schema_bundle

insert into sales_configurator.partner_accounts (
    cms_user_id,
    status,
    display_name,
    contact_email
)
values (
    'local:legacy-partner',
    'active',
    'Legacy partner',
    'legacy-partner@example.test'
)
returning id as partner_id
\gset

insert into sales_configurator.clients (
    partner_account_id,
    company_name,
    contact_name,
    contact_email
)
values (
    :'partner_id'::bigint,
    'Legacy client',
    'Legacy contact',
    'legacy-client@example.test'
)
returning id as client_id
\gset

insert into sales_configurator.proposals (
    partner_account_id,
    client_id,
    title
)
values (
    :'partner_id'::bigint,
    :'client_id'::bigint,
    'Legacy proposal'
)
returning id as proposal_id
\gset

insert into sales_configurator.proposal_events (
    proposal_id,
    event_type,
    actor_type,
    actor_id,
    metadata
)
values
    (
        :'proposal_id'::bigint,
        'created',
        'partner',
        'local:legacy-partner',
        '{"legacy":true}'::jsonb
    ),
    (
        :'proposal_id'::bigint,
        'status_changed',
        'admin',
        'local:legacy-admin',
        '{"legacy":true}'::jsonb
    );

create temporary table legacy_ownership_expected (
    partner_id bigint not null,
    client_id bigint not null,
    proposal_id bigint not null
) on commit preserve rows;
insert into legacy_ownership_expected (partner_id, client_id, proposal_id)
values (
    :'partner_id'::bigint,
    :'client_id'::bigint,
    :'proposal_id'::bigint
);

alter table sales_configurator.clients
    add column owner_cms_user_id text;
update sales_configurator.clients client
set owner_cms_user_id = partner.cms_user_id
from sales_configurator.partner_accounts partner
where partner.id = client.partner_account_id;
alter table sales_configurator.clients
    alter column owner_cms_user_id set not null,
    add constraint clients_owner_cms_user_id_fkey
        foreign key (owner_cms_user_id)
        references sales_configurator.partner_accounts(cms_user_id)
        on delete restrict,
    add constraint clients_owner_identity
        unique (id, owner_cms_user_id);

alter table sales_configurator.proposals
    add column owner_cms_user_id text;
update sales_configurator.proposals proposal
set owner_cms_user_id = partner.cms_user_id
from sales_configurator.partner_accounts partner
where partner.id = proposal.partner_account_id;
alter table sales_configurator.proposals
    alter column owner_cms_user_id set not null,
    add constraint proposals_owner_cms_user_id_fkey
        foreign key (owner_cms_user_id)
        references sales_configurator.partner_accounts(cms_user_id)
        on delete restrict,
    add constraint proposals_owner_identity
        unique (id, owner_cms_user_id),
    add constraint proposals_client_owner_fk
        foreign key (client_id, owner_cms_user_id)
        references sales_configurator.clients(id, owner_cms_user_id)
        on delete restrict;

create index clients_owner_updated_idx
    on sales_configurator.clients(owner_cms_user_id, updated_at desc, id desc);
create index proposals_owner_updated_idx
    on sales_configurator.proposals(owner_cms_user_id, updated_at desc, id desc);

drop trigger protect_client_partner_account_id
    on sales_configurator.clients;
drop trigger protect_proposal_partner_account_id
    on sales_configurator.proposals;

create or replace function sales_configurator.protect_owner_cms_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.owner_cms_user_id <> old.owner_cms_user_id then
        raise exception 'immutable: owner cmsUserId cannot change';
    end if;
    return new;
end;
$$;

create trigger protect_client_owner_cms_user_id
before update of owner_cms_user_id on sales_configurator.clients
for each row execute function sales_configurator.protect_owner_cms_user_id();

create trigger protect_proposal_owner_cms_user_id
before update of owner_cms_user_id on sales_configurator.proposals
for each row execute function sales_configurator.protect_owner_cms_user_id();

alter table sales_configurator.proposals
    drop column partner_account_id cascade;
alter table sales_configurator.clients
    drop column partner_account_id cascade;

\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle

do $migration_assertions$
begin
    if not exists (
        select 1
        from sales_configurator.clients client
        cross join legacy_ownership_expected expected
        where client.id = expected.client_id
          and client.partner_account_id = expected.partner_id
          and client.company_name = 'Legacy client'
    ) or not exists (
        select 1
        from sales_configurator.proposals proposal
        cross join legacy_ownership_expected expected
        where proposal.id = expected.proposal_id
          and proposal.partner_account_id = expected.partner_id
          and proposal.client_id = expected.client_id
          and proposal.title = 'Legacy proposal'
    ) then
        raise exception 'legacy ownership migration lost or reassigned business data';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_attribute attribute
        join pg_catalog.pg_class table_state on table_state.oid = attribute.attrelid
        where table_state.oid in (
            'sales_configurator.clients'::regclass,
            'sales_configurator.proposals'::regclass
        )
          and attribute.attname = 'owner_cms_user_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
    ) then
        raise exception 'legacy CMS user ownership columns survived migration';
    end if;

    if pg_catalog.to_regprocedure(
        'sales_configurator.save_partner_client(bigint,bigint,jsonb)'
    ) is null or pg_catalog.to_regprocedure(
        'sales_configurator.save_partner_client(text,bigint,jsonb)'
    ) is not null then
        raise exception 'legacy CMS-user client command signature survived migration';
    end if;

    if not exists (
        select 1
        from sales_configurator.proposal_events event
        cross join legacy_ownership_expected expected
        where event.proposal_id = expected.proposal_id
          and event.actor_type = 'partner'
          and event.actor_id = expected.partner_id::text
    ) or exists (
        select 1
        from sales_configurator.proposal_events event
        cross join legacy_ownership_expected expected
        where event.proposal_id = expected.proposal_id
          and event.actor_type = 'partner'
          and event.actor_id like 'local:%'
    ) then
        raise exception 'legacy partner audit actors were not migrated to partner account ids';
    end if;

    if not exists (
        select 1
        from sales_configurator.proposal_events event
        cross join legacy_ownership_expected expected
        where event.proposal_id = expected.proposal_id
          and event.actor_type = 'admin'
          and event.actor_id = 'local:legacy-admin'
    ) then
        raise exception 'legacy admin audit actor was altered';
    end if;

    if sales_configurator.partner_proposal_json(
        (select expected.proposal_id from legacy_ownership_expected expected),
        (select expected.partner_id from legacy_ownership_expected expected)
    )::text like '%local:legacy-%' then
        raise exception 'partner projection leaked a legacy CMS user id';
    end if;

    if not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
            sales_configurator.admin_proposal_json(
                (select expected.proposal_id from legacy_ownership_expected expected)
            ) -> 'events'
        ) event
        where event ->> 'actorType' = 'admin'
          and event ->> 'actorId' = 'local:legacy-admin'
    ) then
        raise exception 'admin projection lost the full legacy audit actor';
    end if;
end;
$migration_assertions$;

drop schema if exists sales_configurator cascade;
