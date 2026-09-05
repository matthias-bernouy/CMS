create or replace function commerce.reject_buyer_legal_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'conflict: buyer legal evidence is immutable';
end;
$$;

drop trigger if exists buyer_legal_document_versions_immutable
on commerce.buyer_legal_document_versions;
create trigger buyer_legal_document_versions_immutable
before update or delete on commerce.buyer_legal_document_versions
for each row execute function commerce.reject_buyer_legal_evidence_mutation();

drop trigger if exists order_buyer_legal_acceptances_immutable
on commerce.order_buyer_legal_acceptances;
create trigger order_buyer_legal_acceptances_immutable
before update or delete on commerce.order_buyer_legal_acceptances
for each row execute function commerce.reject_buyer_legal_evidence_mutation();

create or replace function commerce.assert_buyer_legal_acceptance_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if not exists (
        select 1
        from commerce.orders order_row
        join commerce.order_payment_attempts attempt
          on attempt.id = new.payment_attempt_id
         and attempt.order_id = order_row.id
        where order_row.id = new.order_id
          and order_row.checkout_group_id = new.checkout_group_id
          and order_row.buyer_cms_user_id = new.buyer_cms_user_id
    ) then
        raise exception 'conflict: buyer legal evidence does not match its order and payment attempt';
    end if;
    return new;
end;
$$;

drop trigger if exists order_buyer_legal_acceptances_consistent
on commerce.order_buyer_legal_acceptances;
create trigger order_buyer_legal_acceptances_consistent
before insert on commerce.order_buyer_legal_acceptances
for each row execute function commerce.assert_buyer_legal_acceptance_consistency();
