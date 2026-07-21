\set ON_ERROR_STOP on

begin;
set local role service_role;

insert into delivery.delivery_quotes (
    quote_id, request_key, external_order_id, order_version, revision,
    selected_by, selected_for_cms_user_id, relay_location, relay_country,
    relay_number, relay_name, relay_address_line1, relay_postal_code, relay_city,
    weight_grams, shipping_amount, currency, merchandise_subtotal_minor_amount,
    recipient_snapshot, seller_fulfillment_snapshot, relay_snapshot,
    request_snapshot, expires_at
) values (
    'mrq_' || repeat('a', 64), 'shipment-create:order-42', 'order-42', 1, 1,
    'buyer-42', 'buyer-42', 'FR-024474', 'FR', '024474', 'Relay A',
    '1 rue du Relais', '75001', 'Paris', 500, 450, 'eur', 12345,
    '{"name":"Buyer Name","firstName":"Buyer","lastName":"Name","phone":"+33600000000","addressLine1":"1 rue Buyer","addressLine2":"","addressLine3":"","postalCode":"75001","city":"Paris","country":"FR","email":"buyer@example.test"}'::jsonb,
    '{"name":"Seller Name","firstName":"Seller","lastName":"Name","phone":"+33611111111","addressLine1":"2 rue Seller","addressLine2":"","addressLine3":"","postalCode":"69001","city":"Lyon","country":"FR","email":"seller@example.test"}'::jsonb,
    '{"location":"FR-024474"}'::jsonb, '{}'::jsonb,
    '2099-01-01T00:00:00Z'::timestamptz
);

do $shipment_creation$
declare
    reservation jsonb := jsonb_build_object(
        'id', 'shipment-42',
        'external_order_id', 'order-42',
        'idempotency_key', 'order-42',
        'status', 'creating',
        'provider_call_started_at', '2026-07-21T10:00:00Z',
        'creation_manual_review_at', null,
        'seller_cms_user_id', 'seller-42',
        'delivery_quote_id', 'mrq_' || repeat('a', 64),
        'label_format', '10x15',
        'mode_collection', 'CCC',
        'mode_delivery', '24R',
        'delivery_relay_country', 'FR',
        'delivery_relay_number', 'FR-024474',
        'sender_name', 'Seller Name',
        'sender_email', 'seller@example.test',
        'sender_phone', '+33611111111',
        'sender_address_line1', '2 rue Seller',
        'sender_postal_code', '69001',
        'sender_city', 'Lyon',
        'sender_country', 'FR',
        'recipient_name', 'Buyer Name',
        'recipient_email', 'buyer@example.test',
        'recipient_phone', '+33600000000',
        'recipient_address_line1', '1 rue Buyer',
        'recipient_postal_code', '75001',
        'recipient_city', 'Paris',
        'recipient_country', 'FR',
        'weight_grams', 500,
        'declared_value_minor_amount', 12345,
        'declared_currency', 'EUR',
        'package_count', 1,
        'length_cm', 30,
        'metadata', '{"commerceOrderId":"order-42"}'::jsonb,
        'raw_request', '{"externalOrderId":"order-42","metadata":{"commerceOrderId":"order-42"}}'::jsonb,
        'raw_response', '{}'::jsonb,
        'created_by', 'system'
    );
    quote_check jsonb := jsonb_build_object(
        'externalOrderId', 'order-42',
        'deliveryRelayLocation', 'FR-024474',
        'weightGrams', 500,
        'declaredValueMinorAmount', 12345,
        'declaredCurrency', 'EUR',
        'sender', '{"name":"Seller Name","firstName":"Seller","lastName":"Name","phone":"+33611111111","addressLine1":"2 rue Seller","addressLine2":"","addressLine3":"","postalCode":"69001","city":"Lyon","country":"FR","email":"seller@example.test"}'::jsonb,
        'recipient', '{"name":"Buyer Name","firstName":"Buyer","lastName":"Name","phone":"+33600000000","addressLine1":"1 rue Buyer","addressLine2":"","addressLine3":"","postalCode":"75001","city":"Paris","country":"FR","email":"buyer@example.test"}'::jsonb
    );
    divergent_reservation jsonb;
    retry_reservation jsonb;
    result jsonb;
begin
    divergent_reservation := reservation || jsonb_build_object(
        'id', 'shipment-divergent',
        'external_order_id', 'order-divergent',
        'idempotency_key', 'order-divergent',
        'declared_value_minor_amount', 1,
        'sender_name', 'Wrong Seller',
        'recipient_name', 'Wrong Buyer'
    );
    begin
        perform delivery.reserve_shipment_creation(
            divergent_reservation, quote_check, 'fulfillment', 'order-42', 'buyer-42',
            '2026-07-21T10:00:00Z'::timestamptz
        );
        raise exception 'shipment creation: divergent reservation unexpectedly succeeded';
    exception when others then
        if sqlerrm not like 'conflict: shipment reservation does not match validated quote context%' then
            raise;
        end if;
    end;

    result := delivery.reserve_shipment_creation(
        reservation, quote_check, 'fulfillment', 'order-42', 'buyer-42',
        '2026-07-21T10:00:01Z'::timestamptz
    );
    if result->>'outcome' <> 'provider_required'
       or result->'shipment'->>'id' <> 'shipment-42' then
        raise exception 'shipment creation: initial reservation changed';
    end if;
    if result->'shipment' ?| array['raw_request', 'metadata', 'label_url', 'recipient_email'] then
        raise exception 'shipment creation: private reservation data leaked';
    end if;

    result := delivery.reserve_shipment_creation(
        reservation, quote_check, 'fulfillment', 'order-42', 'buyer-42',
        '2026-07-21T10:00:02Z'::timestamptz
    );
    if result->>'outcome' <> 'creating'
       or (select count(*) from delivery.shipments where idempotency_key = 'order-42') <> 1 then
        raise exception 'shipment creation: in-progress replay changed';
    end if;

    update delivery.shipments set status = 'label_ready', expedition_number = '00435394',
        tracking_number = '00435394', tracking_url = 'https://tracking.example/00435394'
    where id = 'shipment-42';
    result := delivery.reserve_shipment_creation(
        reservation, quote_check, 'fulfillment', 'order-42', 'buyer-42',
        '2026-07-21T10:00:03Z'::timestamptz
    );
    if result->>'outcome' <> 'replay'
       or result->'shipment'->>'expedition_number' <> '00435394' then
        raise exception 'shipment creation: terminal replay changed';
    end if;

    begin
        perform delivery.reserve_shipment_creation(
            jsonb_set(reservation, '{raw_request,metadata,commerceOrderId}', '"changed"'),
            quote_check, 'fulfillment', 'order-42', 'buyer-42',
            '2026-07-21T10:00:04Z'::timestamptz
        );
        raise exception 'shipment creation: changed raw request unexpectedly replayed';
    exception when others then
        if sqlerrm not like 'conflict: idempotency key was already used with a different shipment payload%' then
            raise;
        end if;
    end;

    update delivery.shipments set
        status = 'failed', last_error = 'retry-safe rejection',
        sender_email = 'preserved-sender@example.test',
        sender_phone = '+33699999999',
        sender_address_line2 = 'Preserved sender detail',
        instructions = 'Preserved instructions',
        created_by = 'preserved-actor'
    where id = 'shipment-42';
    retry_reservation := reservation - array[
        'sender_email', 'sender_phone', 'sender_address_line2', 'instructions', 'created_by'
    ];
    result := delivery.reserve_shipment_creation(
        retry_reservation, quote_check, 'fulfillment', 'order-42', 'buyer-42',
        '2026-07-21T10:00:05Z'::timestamptz
    );
    if result->>'outcome' <> 'provider_required'
       or not exists (
            select 1 from delivery.shipments
            where id = 'shipment-42' and status = 'creating'
              and sender_email = 'preserved-sender@example.test'
              and sender_phone = '+33699999999'
              and sender_address_line2 = 'Preserved sender detail'
              and instructions = 'Preserved instructions'
              and created_by = 'preserved-actor'
       ) then
        raise exception 'shipment creation: failed retry was not acquired';
    end if;

    update delivery.shipments set status = 'creating',
        provider_call_started_at = '2026-07-21T09:00:00Z'::timestamptz
    where id = 'shipment-42';
    result := delivery.reserve_shipment_creation(
        reservation, quote_check, 'fulfillment', 'order-42', 'buyer-42',
        '2026-07-21T10:00:06Z'::timestamptz
    );
    if result->>'outcome' <> 'stale_unknown'
       or (select status from delivery.shipments where id = 'shipment-42') <> 'unknown' then
        raise exception 'shipment creation: stale reservation was not quarantined';
    end if;
end;
$shipment_creation$;

do $security$
declare
    target oid := to_regprocedure(
        'delivery.reserve_shipment_creation(jsonb,jsonb,text,text,text,timestamptz)'
    );
begin
    if target is null then raise exception 'shipment creation: RPC is missing'; end if;
    if exists (
        select 1 from pg_catalog.pg_proc where oid = target and (
            prosecdef or provolatile <> 'v'
            or not coalesce(proconfig @> array['search_path=""'], false)
        )
    ) then raise exception 'shipment creation: RPC security changed'; end if;
    if has_function_privilege('anon', target, 'execute')
       or has_function_privilege('authenticated', target, 'execute')
       or not has_function_privilege('service_role', target, 'execute') then
        raise exception 'shipment creation: RPC grants changed';
    end if;
end;
$security$;

rollback;
