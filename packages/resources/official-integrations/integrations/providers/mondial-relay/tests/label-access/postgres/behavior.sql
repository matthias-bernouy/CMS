begin;
alter table delivery.shipments drop constraint shipments_label_url_http;
set local role service_role;
select label_access_test.cleanup();

select label_access_test.seed(
    'ok', 'a', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/ok.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
select label_access_test.seed(
    'revoked', 'b', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/revoked.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', pg_catalog.clock_timestamp()
);
select label_access_test.seed(
    'expired', 'c', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/expired.pdf',
    pg_catalog.clock_timestamp() - interval '1 second', null
);
select label_access_test.seed(
    'missing-label', 'd', 'label_ready', null,
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
select label_access_test.seed(
    'cancelled-unscanned', 'e', 'cancelled_unscanned',
    'https://connect-api-sandbox.mondialrelay.com/labels/cancelled-unscanned.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
select label_access_test.seed(
    'cancelled', 'f', 'cancelled',
    'https://connect-api-sandbox.mondialrelay.com/labels/cancelled.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
select label_access_test.seed(
    'manual-review', '1', 'manual_review',
    'https://connect-api-sandbox.mondialrelay.com/labels/manual-review.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
select label_access_test.seed(
    'carrier-accepted', '2', 'carrier_accepted',
    'https://connect-api-sandbox.mondialrelay.com/labels/carrier-accepted.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
select label_access_test.seed(
    'whitespace-label', '4', 'label_ready', '   ',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
select label_access_test.seed(
    'nullable-expedition', '5', 'label_ready',
    'https://connect-api-sandbox.mondialrelay.com/labels/nullable-expedition.pdf',
    pg_catalog.clock_timestamp() + interval '10 minutes', null
);
update delivery.shipments
set expedition_number = null
where id = 'label-access-pg-nullable-expedition';

do $contract$
declare
    v_result jsonb;
begin
    v_result := delivery.get_label_access_context(
        pg_catalog.repeat('a', 64), 'label-access-pg-seller'
    );
    if v_result is distinct from pg_catalog.jsonb_build_object(
        'state', 'ok',
        'shipment', pg_catalog.jsonb_build_object(
            'expedition_number', 'label-access-pg-expedition-ok',
            'label_url', 'https://connect-api-sandbox.mondialrelay.com/labels/ok.pdf'
        )
    ) then
        raise exception 'label access: success projection changed: %', v_result;
    end if;
    if delivery.get_label_access_context(
        pg_catalog.repeat('9', 64), 'label-access-pg-seller'
    ) is distinct from '{"state":"not_found"}'::jsonb
       or delivery.get_label_access_context(
        pg_catalog.repeat('a', 64), 'wrong-seller'
    ) is distinct from '{"state":"not_found"}'::jsonb
       or delivery.get_label_access_context(
        pg_catalog.repeat('b', 64), 'label-access-pg-seller'
    ) is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'label access: token anti-enumeration precedence changed';
    end if;
    if delivery.get_label_access_context(
        pg_catalog.repeat('c', 64), 'label-access-pg-seller'
    ) is distinct from '{"state":"expired"}'::jsonb then
        raise exception 'label access: expiry state changed';
    end if;
    foreach v_result in array array[
        delivery.get_label_access_context(repeat('d', 64), 'label-access-pg-seller'),
        delivery.get_label_access_context(repeat('e', 64), 'label-access-pg-seller'),
        delivery.get_label_access_context(repeat('f', 64), 'label-access-pg-seller'),
        delivery.get_label_access_context(repeat('1', 64), 'label-access-pg-seller')
    ] loop
        if v_result is distinct from '{"state":"label_missing"}'::jsonb then
            raise exception 'label access: shipment refusal changed: %', v_result;
        end if;
    end loop;
    if delivery.get_label_access_context(
        repeat('2', 64), 'label-access-pg-seller'
    )->>'state' <> 'ok' then
        raise exception 'label access: historical allowed statuses narrowed';
    end if;
    if delivery.get_label_access_context(
        repeat('4', 64), 'label-access-pg-seller'
    )->>'state' <> 'ok' then
        raise exception 'label access: whitespace-only label URL was reinterpreted as missing';
    end if;
    if delivery.get_label_access_context(
        repeat('5', 64), 'label-access-pg-seller'
    ) is distinct from pg_catalog.jsonb_build_object(
        'state', 'ok',
        'shipment', pg_catalog.jsonb_build_object(
            'expedition_number', null,
            'label_url', 'https://connect-api-sandbox.mondialrelay.com/labels/nullable-expedition.pdf'
        )
    ) then
        raise exception 'label access: nullable expedition number was rejected';
    end if;
end;
$contract$;

rollback;
