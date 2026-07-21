begin;
set local role service_role;

insert into delivery.shipments (
    id, external_order_id, idempotency_key, expedition_number, status,
    seller_cms_user_id, recipient_name, recipient_postal_code,
    recipient_city, weight_grams
) values (
    'seller-handoff-contract', 'order-handoff-contract',
    'order-handoff-contract', '12345678', 'label_ready',
    'seller-handoff-contract', 'Private Buyer', '75001', 'Paris', 500
);

do $contract$
declare
    first_result jsonb;
    replay_result jsonb;
    result_key_count bigint;
    stored_timestamp timestamptz;
    updated_timestamp timestamptz;
    error_message text;
begin
    first_result := delivery.declare_seller_handoff(
        'order-handoff-contract', 'seller-handoff-contract'
    );
    select pg_catalog.count(*) into result_key_count
    from pg_catalog.jsonb_object_keys(first_result);
    if first_result - array[
        'id', 'external_order_id', 'expedition_number', 'status',
        'carrier_accepted_at', 'recipient_handoff_at',
        'seller_handoff_declared_at'
    ]::text[] <> '{}'::jsonb
       or result_key_count <> 7
       or first_result->>'id' <> 'seller-handoff-contract'
       or first_result->>'external_order_id' <> 'order-handoff-contract'
       or first_result->>'expedition_number' <> '12345678'
       or first_result->>'status' <> 'label_ready'
       or first_result->>'seller_handoff_declared_at' is null
       or first_result->'carrier_accepted_at' <> 'null'::jsonb
       or first_result->'recipient_handoff_at' <> 'null'::jsonb then
        raise exception 'seller handoff: first projection changed: %',
            first_result;
    end if;
    select seller_handoff_declared_at, updated_at
    into stored_timestamp, updated_timestamp
    from delivery.shipments where id = 'seller-handoff-contract';
    if stored_timestamp is distinct from
            (first_result->>'seller_handoff_declared_at')::timestamptz
       or updated_timestamp < stored_timestamp then
        raise exception 'seller handoff: response is not the stored timestamp';
    end if;

    replay_result := delivery.declare_seller_handoff(
        'order-handoff-contract', 'seller-handoff-contract'
    );
    if replay_result is distinct from first_result then
        raise exception 'seller handoff: replay changed: %', replay_result;
    end if;

    update delivery.shipments set
        status = 'carrier_accepted',
        carrier_accepted_at = '2026-07-21 08:01:00+00'
    where id = 'seller-handoff-contract';
    replay_result := delivery.declare_seller_handoff(
        'order-handoff-contract', 'seller-handoff-contract'
    );
    if replay_result->>'seller_handoff_declared_at'
            is distinct from first_result->>'seller_handoff_declared_at'
       or replay_result->>'status' <> 'carrier_accepted'
       or (replay_result->>'carrier_accepted_at')::timestamptz
            <> '2026-07-21 08:01:00+00'::timestamptz then
        raise exception 'seller handoff: progressed replay changed: %',
            replay_result;
    end if;

    begin
        perform delivery.declare_seller_handoff(
            'order-handoff-contract', 'seller-other'
        );
        raise exception 'seller handoff: wrong actor was accepted';
    exception when raise_exception then
        get stacked diagnostics error_message = message_text;
        if error_message <> 'not_found: shipment not found' then
            raise exception 'seller handoff: wrong actor leaked: %',
                error_message;
        end if;
    end;

    begin
        perform delivery.declare_seller_handoff(
            'order-handoff-contract', '  '
        );
        raise exception 'seller handoff: blank actor was accepted';
    exception when raise_exception then
        get stacked diagnostics error_message = message_text;
        if error_message <> 'validation: seller CMS user id is required' then
            raise exception 'seller handoff: blank actor changed: %',
                error_message;
        end if;
    end;
end;
$contract$;

rollback;
