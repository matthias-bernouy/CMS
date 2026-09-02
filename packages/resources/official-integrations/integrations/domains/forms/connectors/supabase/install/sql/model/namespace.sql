create schema if not exists forms;

revoke all on schema forms from public;
revoke all on schema forms from anon;
revoke all on schema forms from authenticated;

create or replace function forms.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;
