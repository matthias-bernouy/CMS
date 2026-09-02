create or replace function commerce.protect_marketplace_service_withdrawal_request_facts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if old.public_id is distinct from new.public_id
        or old.order_id is distinct from new.order_id
        or old.buyer_cms_user_id is distinct from new.buyer_cms_user_id
        or old.service_scope is distinct from new.service_scope
        or old.reason is distinct from new.reason
        or old.confirmation_key is distinct from new.confirmation_key
        or old.confirmed_at is distinct from new.confirmed_at
        or old.legal_acceptances_snapshot is distinct from new.legal_acceptances_snapshot
        or old.idempotency_key is distinct from new.idempotency_key
        or old.request_hash is distinct from new.request_hash
        or old.submitted_at is distinct from new.submitted_at then
        raise exception 'conflict: service withdrawal request evidence is immutable';
    end if;
    return new;
end;
$$;

drop trigger if exists marketplace_service_withdrawal_request_facts_immutable
on commerce.marketplace_service_withdrawal_requests;
create trigger marketplace_service_withdrawal_request_facts_immutable
before update on commerce.marketplace_service_withdrawal_requests
for each row execute function commerce.protect_marketplace_service_withdrawal_request_facts();

create or replace function commerce.reject_marketplace_service_withdrawal_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    raise exception 'conflict: service withdrawal request events are immutable';
end;
$$;

drop trigger if exists marketplace_service_withdrawal_events_immutable
on commerce.marketplace_service_withdrawal_events;
create trigger marketplace_service_withdrawal_events_immutable
before update or delete on commerce.marketplace_service_withdrawal_events
for each row execute function commerce.reject_marketplace_service_withdrawal_event_mutation();
