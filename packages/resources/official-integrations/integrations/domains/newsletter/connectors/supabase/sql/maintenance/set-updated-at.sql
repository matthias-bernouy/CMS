

create or replace function newsletter.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on newsletter.subscriptions;
create trigger subscriptions_set_updated_at
before update on newsletter.subscriptions
for each row execute function newsletter.set_updated_at();