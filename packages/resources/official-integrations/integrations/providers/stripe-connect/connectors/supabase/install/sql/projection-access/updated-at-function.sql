

create or replace function stripe_connect.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = greatest(old.updated_at, pg_catalog.clock_timestamp());
    return new;
end;
$$;
