create or replace function sales_configurator.require_partner(
    p_actor_cms_user_id text,
    p_capability text
)
returns bigint
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_actor text := nullif(pg_catalog.btrim(p_actor_cms_user_id), '');
    v_partner_account_id bigint;
begin
    if v_actor is null then
        raise exception 'forbidden: active partner capability required'
            using errcode = '42501';
    end if;
    if p_capability not in (
        'clients.manage',
        'proposals.manage',
        'proposals.publish',
        'proposals.share'
    ) then
        raise exception 'invariant: unknown partner capability';
    end if;

    select partner.id
    into v_partner_account_id
    from sales_configurator.partner_accounts partner
    join sales_configurator.partner_capabilities capability
      on capability.partner_account_id = partner.id
     and capability.capability = p_capability
    where partner.cms_user_id = v_actor
      and partner.status = 'active';

    if v_partner_account_id is null then
        raise exception 'forbidden: active partner capability required'
            using errcode = '42501';
    end if;
    return v_partner_account_id;
end;
$$;

create or replace function sales_configurator.protect_partner_cms_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.cms_user_id <> old.cms_user_id then
        raise exception 'immutable: partner cmsUserId cannot change';
    end if;
    return new;
end;
$$;

drop trigger if exists protect_partner_cms_user_id
    on sales_configurator.partner_accounts;
create trigger protect_partner_cms_user_id
before update of cms_user_id on sales_configurator.partner_accounts
for each row execute function sales_configurator.protect_partner_cms_user_id();

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

drop trigger if exists protect_client_owner_cms_user_id
    on sales_configurator.clients;
create trigger protect_client_owner_cms_user_id
before update of owner_cms_user_id on sales_configurator.clients
for each row execute function sales_configurator.protect_owner_cms_user_id();
