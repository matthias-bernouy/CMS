

create or replace function user_account.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists accounts_set_updated_at on user_account.accounts;
create trigger accounts_set_updated_at
before update on user_account.accounts
for each row execute function user_account.set_updated_at();

drop trigger if exists extra_fields_set_updated_at on user_account.extra_fields;
create trigger extra_fields_set_updated_at
before update on user_account.extra_fields
for each row execute function user_account.set_updated_at();