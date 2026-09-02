

create or replace function delivery.enforce_shipment_relay_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_relay_location text;
    v_weight_grams integer;
begin
    if new.delivery_quote_id is not null then
        select quote.relay_location, quote.weight_grams
        into v_relay_location, v_weight_grams
        from delivery.delivery_quotes quote
        where quote.quote_id = new.delivery_quote_id;
        if not found then
            raise exception 'conflict: shipment delivery quote does not exist';
        end if;
        if new.external_order_id !~ '^claim-return:[1-9][0-9]*$'
            and (new.delivery_relay_number is distinct from v_relay_location
                or new.weight_grams is distinct from v_weight_grams)
        then
            raise exception 'conflict: shipment does not match the immutable delivery quote';
        end if;
        return new;
    end if;
    select selection.relay_location, selection.weight_grams into v_relay_location, v_weight_grams
    from delivery.relay_selections selection
    where selection.external_order_id = new.external_order_id;
    if found and new.delivery_relay_number is distinct from v_relay_location then
        raise exception 'conflict: shipment relay does not match the server selection';
    end if;
    return new;
end;
$$;

drop trigger if exists enforce_shipment_relay_binding on delivery.shipments;
create trigger enforce_shipment_relay_binding
before insert on delivery.shipments
for each row execute function delivery.enforce_shipment_relay_binding();

create or replace function delivery.shipment_address_matches(
    p_actual jsonb,
    p_expected jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
    v_field text;
    v_actual text;
    v_expected text;
begin
    if pg_catalog.jsonb_typeof(p_actual) is distinct from 'object'
        or pg_catalog.jsonb_typeof(p_expected) is distinct from 'object'
    then
        return false;
    end if;
    foreach v_field in array array[
        'name', 'firstName', 'lastName', 'phone', 'addressLine1', 'addressLine2',
        'addressLine3', 'postalCode', 'city', 'country', 'email'
    ] loop
        v_actual := case pg_catalog.jsonb_typeof(p_actual->v_field)
            when 'string' then pg_catalog.btrim(p_actual->>v_field)
            when 'number' then p_actual->>v_field
            else '' end;
        v_expected := case pg_catalog.jsonb_typeof(p_expected->v_field)
            when 'string' then pg_catalog.btrim(p_expected->>v_field)
            when 'number' then p_expected->>v_field
            else '' end;
        if v_actual is distinct from v_expected then return false; end if;
    end loop;
    return true;
end;
$$;

create or replace function delivery.shipment_reservation_matches(
    p_candidate delivery.shipments,
    p_check jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
    select
        p_candidate.status = 'creating'
        and p_candidate.external_order_id is not distinct from p_check->>'externalOrderId'
        and p_candidate.delivery_relay_number is not distinct from p_check->>'deliveryRelayLocation'
        and p_candidate.delivery_relay_country is not distinct from
            pg_catalog.upper(pg_catalog.left(p_check->>'deliveryRelayLocation', 2))
        and p_candidate.weight_grams is not distinct from (p_check->>'weightGrams')::integer
        and p_candidate.declared_value_minor_amount
            is not distinct from (p_check->>'declaredValueMinorAmount')::bigint
        and p_candidate.declared_currency is not distinct from p_check->>'declaredCurrency'
        and coalesce(p_candidate.sender_name, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'name', ''))
        and coalesce(p_candidate.sender_email, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'email', ''))
        and coalesce(p_candidate.sender_phone, '') = coalesce(
            nullif(pg_catalog.btrim(coalesce(p_check->'sender'->>'phone', '')), ''),
            pg_catalog.btrim(coalesce(p_check->'sender'->>'mobile', ''))
        )
        and coalesce(p_candidate.sender_address_line1, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'addressLine1', ''))
        and coalesce(p_candidate.sender_address_line2, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'addressLine2', ''))
        and coalesce(p_candidate.sender_address_line3, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'addressLine3', ''))
        and coalesce(p_candidate.sender_postal_code, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'postalCode', ''))
        and coalesce(p_candidate.sender_city, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'city', ''))
        and coalesce(p_candidate.sender_country, '') =
            pg_catalog.btrim(coalesce(p_check->'sender'->>'country', ''))
        and coalesce(p_candidate.recipient_name, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'name', ''))
        and coalesce(p_candidate.recipient_email, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'email', ''))
        and coalesce(p_candidate.recipient_phone, '') = coalesce(
            nullif(pg_catalog.btrim(coalesce(p_check->'recipient'->>'phone', '')), ''),
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'mobile', ''))
        )
        and coalesce(p_candidate.recipient_address_line1, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'addressLine1', ''))
        and coalesce(p_candidate.recipient_address_line2, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'addressLine2', ''))
        and coalesce(p_candidate.recipient_address_line3, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'addressLine3', ''))
        and coalesce(p_candidate.recipient_postal_code, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'postalCode', ''))
        and coalesce(p_candidate.recipient_city, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'city', ''))
        and coalesce(p_candidate.recipient_country, '') =
            pg_catalog.btrim(coalesce(p_check->'recipient'->>'country', ''))
$$;