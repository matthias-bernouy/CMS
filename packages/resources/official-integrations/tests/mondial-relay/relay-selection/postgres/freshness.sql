create extension if not exists dblink;
set statement_timeout = '15s';

delete from delivery.delivery_quotes
where external_order_id = 'relay-selection-freshness';

select public.dblink_connect('relay_selection_reader', 'dbname=' || current_database());
select public.dblink_connect('relay_selection_writer', 'dbname=' || current_database());
select public.dblink_exec('relay_selection_reader', 'set role service_role');

create temporary table relay_selection_reader_backend(pid integer not null);
insert into relay_selection_reader_backend
select pid
from public.dblink('relay_selection_reader', 'select pg_backend_pid()') response(pid integer);

select public.dblink_exec('relay_selection_writer', 'begin');
select public.dblink_exec(
    'relay_selection_writer',
    'lock table delivery.delivery_quotes in access exclusive mode'
);
select public.dblink_exec(
    'relay_selection_writer',
    $insert$
    insert into delivery.delivery_quotes (
        quote_id, request_key, external_order_id, order_version, revision,
        selected_by, selected_for_cms_user_id, relay_location, relay_country,
        relay_number, relay_name, relay_address_line1, relay_address_line2,
        relay_postal_code, relay_city, relay_latitude, relay_longitude,
        weight_grams, shipping_amount, currency, merchandise_subtotal_minor_amount,
        recipient_snapshot, seller_fulfillment_snapshot, relay_snapshot,
        request_snapshot, quoted_at, expires_at, created_at
    ) values (
        'mrq_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        'relay-selection-freshness', 'relay-selection-freshness', 1, 1,
        'buyer-123', 'buyer-123', 'FR-999999', 'FR', '999999',
        'FRESH QUOTE', '9 RUE FRAICHE', '', '75009', 'PARIS', 48.88, 2.36,
        500, 450, 'eur', 1000, '{}', '{}',
        '{"nature":"1","pointType":"relay_point"}', '{}',
        '2026-07-20 10:00:00+00', '2099-07-20 11:00:00+00',
        '2026-07-20 10:00:00+00'
    )
    $insert$
);

select public.dblink_send_query(
    'relay_selection_reader',
    $read$
    select delivery.read_relay_selection_context(
        'relay-selection-freshness', 'buyer-123'
    )
    $read$
);

do $wait_for_second_read$
declare
    blocked boolean := false;
begin
    for attempt in 1..200 loop
        select activity.wait_event_type = 'Lock' into blocked
        from relay_selection_reader_backend reader
        join pg_catalog.pg_stat_activity activity on activity.pid = reader.pid;
        exit when coalesce(blocked, false);
        perform pg_catalog.pg_sleep(0.01);
    end loop;
    if not coalesce(blocked, false) then
        raise exception 'relay selection: reader did not reach the quote read';
    end if;
end;
$wait_for_second_read$;

select public.dblink_exec('relay_selection_writer', 'commit');

do $freshness$
declare
    context jsonb;
begin
    select result into strict context
    from public.dblink_get_result('relay_selection_reader') response(result jsonb);
    if context #>> '{outcome}' <> 'quote'
       or context #>> '{row,quote_id}'
            <> 'mrq_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' then
        raise exception 'relay selection: quote committed between reads was missed: %', context;
    end if;
end;
$freshness$;

select public.dblink_disconnect('relay_selection_reader');
select public.dblink_disconnect('relay_selection_writer');
drop table relay_selection_reader_backend;
delete from delivery.delivery_quotes
where external_order_id = 'relay-selection-freshness';
