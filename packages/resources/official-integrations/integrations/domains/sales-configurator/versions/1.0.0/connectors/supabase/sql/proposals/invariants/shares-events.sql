create or replace function sales_configurator.protect_proposal_share()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'immutable: proposal shares cannot be deleted';
    end if;
    if new.id <> old.id
        or new.proposal_version_id <> old.proposal_version_id
        or new.token_hash <> old.token_hash
        or new.expires_at is distinct from old.expires_at
        or new.created_at <> old.created_at
    then
        raise exception 'immutable: proposal share identity cannot change';
    end if;
    if old.revoked_at is not null
        and new.revoked_at is distinct from old.revoked_at
    then
        raise exception 'immutable: proposal share revocation cannot be reversed';
    end if;
    if old.first_viewed_at is not null
        and new.first_viewed_at is distinct from old.first_viewed_at
    then
        raise exception 'immutable: first proposal view cannot change';
    end if;
    if new.view_count < old.view_count
        or (
            old.last_viewed_at is not null
            and new.last_viewed_at < old.last_viewed_at
        )
    then
        raise exception 'immutable: proposal view counters cannot decrease';
    end if;
    return new;
end;
$$;

drop trigger if exists protect_proposal_share
    on sales_configurator.proposal_shares;
create trigger protect_proposal_share
before update or delete on sales_configurator.proposal_shares
for each row execute function sales_configurator.protect_proposal_share();

create or replace function sales_configurator.protect_proposal_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'immutable: proposal events are append-only';
end;
$$;

drop trigger if exists protect_proposal_event
    on sales_configurator.proposal_events;
create trigger protect_proposal_event
before update or delete on sales_configurator.proposal_events
for each row execute function sales_configurator.protect_proposal_event();
