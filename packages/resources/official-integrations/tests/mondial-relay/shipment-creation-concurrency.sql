\set ON_ERROR_STOP on

create extension if not exists dblink;
create schema delivery_shipment_creation_test;

insert into delivery.delivery_quotes (
    quote_id, request_key, external_order_id, order_version, revision,
    selected_by, selected_for_cms_user_id, relay_location, relay_country,
    relay_number, relay_name, relay_address_line1, relay_postal_code, relay_city,
    weight_grams, shipping_amount, currency, merchandise_subtotal_minor_amount,
    recipient_snapshot, seller_fulfillment_snapshot, relay_snapshot,
    request_snapshot, expires_at
) values (
    'mrq_' || repeat('b', 64), 'shipment-concurrency:order-43', 'order-43', 1, 1,
    'buyer-43', 'buyer-43', 'FR-024474', 'FR', '024474', 'Relay B',
    '1 rue du Relais', '75001', 'Paris', 500, 450, 'eur', 12345,
    '{"name":"Buyer","firstName":"Buyer","lastName":"Name","phone":"+33600000000","addressLine1":"1 rue Buyer","addressLine2":"","addressLine3":"","postalCode":"75001","city":"Paris","country":"FR","email":"buyer@example.test"}'::jsonb,
    '{"name":"Seller","firstName":"Seller","lastName":"Name","phone":"+33611111111","addressLine1":"2 rue Seller","addressLine2":"","addressLine3":"","postalCode":"69001","city":"Lyon","country":"FR","email":"seller@example.test"}'::jsonb,
    '{"location":"FR-024474"}'::jsonb, '{}'::jsonb,
    '2099-01-01T00:00:00Z'::timestamptz
);

create function delivery_shipment_creation_test.reserve()
returns jsonb
language sql
set search_path = ''
as $$
    select delivery.reserve_shipment_creation(
        jsonb_build_object(
            'id', 'shipment-concurrency',
            'external_order_id', 'order-43',
            'idempotency_key', 'order-43',
            'status', 'creating',
            'provider_call_started_at', '2026-07-21T10:00:00Z',
            'seller_cms_user_id', 'seller-43',
            'delivery_quote_id', 'mrq_' || repeat('b', 64),
            'label_format', '10x15', 'mode_collection', 'CCC', 'mode_delivery', '24R',
            'delivery_relay_country', 'FR', 'delivery_relay_number', 'FR-024474',
            'sender_name', 'Seller', 'sender_phone', '+33611111111',
            'sender_address_line1', '2 rue Seller', 'sender_postal_code', '69001',
            'sender_city', 'Lyon', 'sender_country', 'FR',
            'recipient_name', 'Buyer', 'recipient_phone', '+33600000000',
            'recipient_address_line1', '1 rue Buyer', 'recipient_postal_code', '75001',
            'recipient_city', 'Paris', 'recipient_country', 'FR',
            'weight_grams', 500, 'declared_value_minor_amount', 12345,
            'declared_currency', 'EUR', 'package_count', 1, 'length_cm', 30,
            'metadata', '{}'::jsonb,
            'raw_request', '{"externalOrderId":"order-43"}'::jsonb,
            'raw_response', '{}'::jsonb
        ),
        jsonb_build_object(
            'externalOrderId', 'order-43', 'deliveryRelayLocation', 'FR-024474',
            'weightGrams', 500, 'declaredValueMinorAmount', 12345,
            'declaredCurrency', 'EUR',
            'sender', '{"name":"Seller","firstName":"Seller","lastName":"Name","phone":"+33611111111","addressLine1":"2 rue Seller","addressLine2":"","addressLine3":"","postalCode":"69001","city":"Lyon","country":"FR","email":"seller@example.test"}'::jsonb,
            'recipient', '{"name":"Buyer","firstName":"Buyer","lastName":"Name","phone":"+33600000000","addressLine1":"1 rue Buyer","addressLine2":"","addressLine3":"","postalCode":"75001","city":"Paris","country":"FR","email":"buyer@example.test"}'::jsonb
        ),
        'fulfillment', 'order-43', 'buyer-43', '2026-07-21T10:00:01Z'::timestamptz
    )
$$;

create function delivery_shipment_creation_test.delay_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.idempotency_key = 'order-43' then perform pg_catalog.pg_sleep(0.3); end if;
    return new;
end;
$$;

create trigger shipment_creation_concurrency_probe
before insert on delivery.shipments
for each row execute function delivery_shipment_creation_test.delay_insert();

grant usage on schema delivery_shipment_creation_test to service_role;
grant execute on function delivery_shipment_creation_test.reserve() to service_role;

select dblink_connect('shipment_creation_a', 'dbname=' || current_database());
select dblink_connect('shipment_creation_b', 'dbname=' || current_database());
select dblink_exec('shipment_creation_a', 'set role service_role');
select dblink_exec('shipment_creation_b', 'set role service_role');
select dblink_send_query(
    'shipment_creation_a',
    'select delivery_shipment_creation_test.reserve() as result'
);
select pg_catalog.pg_sleep(0.05);
select dblink_send_query(
    'shipment_creation_b',
    'select delivery_shipment_creation_test.reserve() as result'
);

create temporary table shipment_creation_results (result jsonb not null);
insert into shipment_creation_results
select result from dblink_get_result('shipment_creation_a') as response(result jsonb);
insert into shipment_creation_results
select result from dblink_get_result('shipment_creation_b') as response(result jsonb);

do $concurrency$
begin
    if (select count(*) from delivery.shipments where idempotency_key = 'order-43') <> 1
       or (select count(*) from shipment_creation_results where result->>'outcome' = 'provider_required') <> 1
       or (select count(*) from shipment_creation_results where result->>'outcome' = 'creating') <> 1 then
        raise exception 'shipment creation: concurrent reservation outcomes changed: %',
            (select jsonb_agg(result) from shipment_creation_results);
    end if;
end;
$concurrency$;

select dblink_disconnect('shipment_creation_a');
select dblink_disconnect('shipment_creation_b');
drop trigger shipment_creation_concurrency_probe on delivery.shipments;
drop schema delivery_shipment_creation_test cascade;
delete from delivery.shipments where idempotency_key = 'order-43';
delete from delivery.delivery_quotes where external_order_id = 'order-43';
