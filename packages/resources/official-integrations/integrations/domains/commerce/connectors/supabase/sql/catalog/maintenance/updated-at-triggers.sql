

create or replace function commerce.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function commerce.set_updated_at_and_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    if new.version = old.version then
        new.version = old.version + 1;
    end if;
    return new;
end;
$$;