create or replace function sales_configurator.protect_proposal_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        if old.state <> 'draft' then
            raise exception 'immutable: published proposal versions cannot be deleted';
        end if;
        return old;
    end if;

    if old.proposal_id <> new.proposal_id
        or old.version_number <> new.version_number
        or old.created_at <> new.created_at
    then
        raise exception 'immutable: proposal version identity cannot change';
    end if;

    if old.state = 'draft' then
        if new.state not in ('draft', 'published') then
            raise exception 'invalid transition: draft proposal version';
        end if;
        if new.revision < old.revision or new.revision > old.revision + 1 then
            raise exception 'invariant: draft revision must advance by at most one';
        end if;
        if new.state = 'published' and new.revision <> old.revision then
            raise exception 'invariant: publishing cannot change draft revision';
        end if;
        if new.state = 'published' and new.published_at is null then
            raise exception 'validation: publishedAt is required';
        end if;
        return new;
    end if;

    if old.state = 'published'
        and new.state = 'superseded'
        and new.proposal_id = old.proposal_id
        and new.version_number = old.version_number
        and new.revision = old.revision
        and new.currency = old.currency
        and new.fixed_total_cents = old.fixed_total_cents
        and new.quote_item_count = old.quote_item_count
        and new.public_title is not distinct from old.public_title
        and new.public_introduction is not distinct from old.public_introduction
        and new.client_company_name = old.client_company_name
        and new.client_company_registration_number
            is not distinct from old.client_company_registration_number
        and new.client_contact_name = old.client_contact_name
        and new.client_contact_job_title is not distinct from old.client_contact_job_title
        and new.client_contact_email = old.client_contact_email
        and new.client_contact_phone is not distinct from old.client_contact_phone
        and new.client_address_line1 is not distinct from old.client_address_line1
        and new.client_address_line2 is not distinct from old.client_address_line2
        and new.client_postal_code is not distinct from old.client_postal_code
        and new.client_city is not distinct from old.client_city
        and new.client_country is not distinct from old.client_country
        and new.sales_contact_name = old.sales_contact_name
        and new.sales_contact_email is not distinct from old.sales_contact_email
        and new.created_at = old.created_at
        and new.published_at = old.published_at
    then
        return new;
    end if;

    raise exception 'immutable: published proposal versions cannot be changed';
end;
$$;

drop trigger if exists protect_proposal_version
    on sales_configurator.proposal_versions;
create trigger protect_proposal_version
before update or delete on sales_configurator.proposal_versions
for each row execute function sales_configurator.protect_proposal_version();

create or replace function sales_configurator.protect_proposal_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_version_id bigint;
    v_version_state text;
begin
    if tg_op = 'UPDATE' and old.proposal_version_id <> new.proposal_version_id then
        raise exception 'immutable: proposal item version cannot change';
    end if;

    v_version_id := case when tg_op = 'DELETE'
        then old.proposal_version_id
        else new.proposal_version_id
    end;

    select version.state
    into v_version_state
    from sales_configurator.proposal_versions version
    where version.id = v_version_id
    for key share;

    if not found then
        raise exception 'validation: proposal version does not exist';
    end if;
    if v_version_state <> 'draft' then
        raise exception 'immutable: published proposal items cannot be changed';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists protect_proposal_item
    on sales_configurator.proposal_items;
create trigger protect_proposal_item
before insert or update or delete on sales_configurator.proposal_items
for each row execute function sales_configurator.protect_proposal_item();

create or replace function sales_configurator.reject_proposal_item_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.parent_item_id is null then
        return new;
    end if;

    if exists (
        with recursive ancestors as (
            select parent.id, parent.parent_item_id
            from sales_configurator.proposal_items parent
            where parent.id = new.parent_item_id
              and parent.proposal_version_id = new.proposal_version_id
            union all
            select parent.id, parent.parent_item_id
            from sales_configurator.proposal_items parent
            join ancestors ancestor on ancestor.parent_item_id = parent.id
            where parent.proposal_version_id = new.proposal_version_id
        )
        select 1
        from ancestors
        where id = new.id
    ) then
        raise exception 'validation: proposal item hierarchy cannot contain a cycle';
    end if;

    return new;
end;
$$;

drop trigger if exists reject_proposal_item_cycle
    on sales_configurator.proposal_items;
create trigger reject_proposal_item_cycle
before insert or update of parent_item_id, proposal_version_id
on sales_configurator.proposal_items
for each row execute function sales_configurator.reject_proposal_item_cycle();
