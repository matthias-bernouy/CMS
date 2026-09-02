

create or replace function broadcast.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists campaigns_set_updated_at on broadcast.campaigns;
create trigger campaigns_set_updated_at
before update on broadcast.campaigns
for each row execute function broadcast.set_updated_at();

drop trigger if exists campaign_recipients_set_updated_at on broadcast.campaign_recipients;
create trigger campaign_recipients_set_updated_at
before update on broadcast.campaign_recipients
for each row execute function broadcast.set_updated_at();