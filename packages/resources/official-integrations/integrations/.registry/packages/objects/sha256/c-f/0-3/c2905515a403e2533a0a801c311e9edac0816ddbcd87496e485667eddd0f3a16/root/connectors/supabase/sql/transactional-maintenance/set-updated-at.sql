

create or replace function emailer.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists emailer_templates_set_updated_at on emailer.templates;
create trigger emailer_templates_set_updated_at
before update on emailer.templates
for each row execute function emailer.set_updated_at();

drop trigger if exists emailer_messages_set_updated_at on emailer.messages;
create trigger emailer_messages_set_updated_at
before update on emailer.messages
for each row execute function emailer.set_updated_at();

drop trigger if exists emailer_settings_set_updated_at on emailer.settings;
create trigger emailer_settings_set_updated_at
before update on emailer.settings
for each row execute function emailer.set_updated_at();