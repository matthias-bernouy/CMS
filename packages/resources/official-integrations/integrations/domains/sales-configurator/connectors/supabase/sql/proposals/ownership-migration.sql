do $partner_event_actor_migration$
begin
    if pg_catalog.to_regclass('sales_configurator.proposal_events') is not null then
        execute $migration$
            drop trigger if exists protect_proposal_event
                on sales_configurator.proposal_events
        $migration$;
        execute $migration$
            update sales_configurator.proposal_events event
            set actor_id = proposal.partner_account_id::text
            from sales_configurator.proposals proposal
            where event.proposal_id = proposal.id
              and event.actor_type = 'partner'
              and event.actor_id is distinct from proposal.partner_account_id::text
        $migration$;
    end if;
end;
$partner_event_actor_migration$;

alter table sales_configurator.proposals
    drop constraint if exists proposals_client_owner_fk,
    drop constraint if exists proposals_owner_identity,
    drop constraint if exists proposals_owner_cms_user_id_fkey,
    drop column if exists owner_cms_user_id;

alter table sales_configurator.clients
    drop constraint if exists clients_owner_identity,
    drop constraint if exists clients_owner_cms_user_id_fkey,
    drop column if exists owner_cms_user_id;

drop index if exists sales_configurator.proposals_owner_updated_idx;
drop index if exists sales_configurator.clients_owner_updated_idx;

do $ownership_migration_complete$
begin
    if exists (
        select 1
        from pg_catalog.pg_attribute attribute
        join pg_catalog.pg_class table_state
          on table_state.oid = attribute.attrelid
        join pg_catalog.pg_namespace namespace
          on namespace.oid = table_state.relnamespace
        where namespace.nspname = 'sales_configurator'
          and table_state.relname in ('clients', 'proposals')
          and attribute.attname = 'owner_cms_user_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
    ) then
        raise exception 'migration: legacy CMS user ownership columns remain';
    end if;
end;
$ownership_migration_complete$;
