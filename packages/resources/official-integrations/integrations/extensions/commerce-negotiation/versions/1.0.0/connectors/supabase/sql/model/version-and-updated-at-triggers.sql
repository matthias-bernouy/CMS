

create or replace function commerce_negotiation.bump_proposal_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if row(new.*) is distinct from row(old.*) then
        new.version = old.version + 1;
    end if;
    return new;
end;
$$;

create or replace function commerce_negotiation.bump_settings_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if row(new.*) is distinct from row(old.*) then
        new.version = old.version + 1;
    end if;
    return new;
end;
$$;

drop trigger if exists negotiation_proposals_bump_version on commerce_negotiation.proposals;
create trigger negotiation_proposals_bump_version
before update on commerce_negotiation.proposals
for each row execute function commerce_negotiation.bump_proposal_version();

drop trigger if exists negotiation_proposals_set_updated_at on commerce_negotiation.proposals;
create trigger negotiation_proposals_set_updated_at
before update on commerce_negotiation.proposals
for each row execute function commerce_negotiation.set_updated_at();

drop trigger if exists negotiation_settings_bump_version on commerce_negotiation.settings;
create trigger negotiation_settings_bump_version
before update on commerce_negotiation.settings
for each row execute function commerce_negotiation.bump_settings_version();

drop trigger if exists negotiation_settings_set_updated_at on commerce_negotiation.settings;
create trigger negotiation_settings_set_updated_at
before update on commerce_negotiation.settings
for each row execute function commerce_negotiation.set_updated_at();