

create or replace function stripe_connect.reject_marketplace_terms_acceptance_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'conflict: marketplace terms acceptance records are immutable';
end;
$$;

drop trigger if exists marketplace_terms_acceptances_immutable
    on stripe_connect.marketplace_terms_acceptances;
create trigger marketplace_terms_acceptances_immutable
before update or delete on stripe_connect.marketplace_terms_acceptances
for each row execute function stripe_connect.reject_marketplace_terms_acceptance_mutation();