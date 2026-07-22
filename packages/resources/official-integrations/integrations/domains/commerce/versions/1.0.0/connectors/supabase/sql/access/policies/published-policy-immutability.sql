

create or replace function commerce.reject_published_policy_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if old.status <> 'draft' then
        raise exception 'conflict: published or retired policies are immutable';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function commerce.reject_published_fee_component_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_status text;
begin
    select status into v_status from commerce.fee_policies where id = old.fee_policy_id;
    if v_status <> 'draft' then raise exception 'conflict: published fee components are immutable'; end if;
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists fee_policies_immutable on commerce.fee_policies;
create trigger fee_policies_immutable before update or delete on commerce.fee_policies
for each row execute function commerce.reject_published_policy_mutation();
drop trigger if exists protection_policies_immutable on commerce.protection_policies;
create trigger protection_policies_immutable before update or delete on commerce.protection_policies
for each row execute function commerce.reject_published_policy_mutation();
drop trigger if exists seller_risk_policies_immutable on commerce.seller_risk_policies;
create trigger seller_risk_policies_immutable before update or delete on commerce.seller_risk_policies
for each row execute function commerce.reject_published_policy_mutation();
drop trigger if exists fee_policy_components_immutable on commerce.fee_policy_components;
create trigger fee_policy_components_immutable before update or delete on commerce.fee_policy_components
for each row execute function commerce.reject_published_fee_component_mutation();