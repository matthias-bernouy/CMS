

create or replace function delivery.enforce_relay_selection_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if exists (
        select 1 from delivery.shipments shipment
        where shipment.external_order_id = old.external_order_id
    ) and (
        new.relay_location is distinct from old.relay_location
        or new.relay_country is distinct from old.relay_country
        or new.relay_number is distinct from old.relay_number
        or new.address_line1 is distinct from old.address_line1
        or new.address_line2 is distinct from old.address_line2
        or new.postal_code is distinct from old.postal_code
        or new.city is distinct from old.city
        or new.weight_grams is distinct from old.weight_grams
    ) then
        raise exception 'conflict: relay selection is already bound to a shipment';
    end if;
    return new;
end;
$$;

drop trigger if exists enforce_relay_selection_binding on delivery.relay_selections;
create trigger enforce_relay_selection_binding
before update on delivery.relay_selections
for each row execute function delivery.enforce_relay_selection_binding();