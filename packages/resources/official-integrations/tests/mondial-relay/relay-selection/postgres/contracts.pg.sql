\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

do $metadata$
declare
    target regprocedure := pg_catalog.to_regprocedure(
        'delivery.read_relay_selection_context(text,text)'
    );
    procedure record;
    definition text;
begin
    if target is null then
        raise exception 'relay selection: read context RPC is missing';
    end if;
    select p.prosecdef, p.provolatile, p.proconfig, l.lanname
    into strict procedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = target;
    if procedure.prosecdef
       or procedure.provolatile <> 'v'
       or procedure.lanname <> 'plpgsql'
       or not coalesce(procedure.proconfig @> array['search_path=""'], false) then
        raise exception 'relay selection: RPC must be private VOLATILE PL/pgSQL invoker code';
    end if;
    if pg_catalog.has_function_privilege('anon', target, 'execute')
       or pg_catalog.has_function_privilege('authenticated', target, 'execute')
       or not pg_catalog.has_function_privilege('service_role', target, 'execute') then
        raise exception 'relay selection: RPC execute ACL changed';
    end if;
    definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(target));
    if pg_catalog.strpos(definition, 'from delivery.relay_selections') = 0
       or pg_catalog.strpos(definition, 'from delivery.delivery_quotes') = 0
       or pg_catalog.strpos(definition, 'from delivery.relay_selections')
            > pg_catalog.strpos(definition, 'from delivery.delivery_quotes') then
        raise exception 'relay selection: selection must be read before quotes';
    end if;
end;
$metadata$;

insert into delivery.relay_selections (
    external_order_id, relay_location, relay_country, relay_number, relay_name,
    address_line1, address_line2, postal_code, city, latitude, longitude,
    weight_grams, shipping_amount, currency, selected_by, snapshot,
    created_at, updated_at
) values (
    'relay-selection-wins', 'FR-111111', 'FR', '111111', 'SELECTED RELAY',
    '1 RUE DE LA SELECTION', '', '75001', 'PARIS', 48.86, 2.34,
    500, 450, 'eur', 'selection-owner',
    '{"nature":"1","pointType":"relay_point"}',
    '2026-07-20 09:00:00+00', '2026-07-20 10:00:00+00'
);

insert into delivery.delivery_quotes (
    quote_id, request_key, external_order_id, order_version, revision,
    selected_by, selected_for_cms_user_id, relay_location, relay_country,
    relay_number, relay_name, relay_address_line1, relay_address_line2,
    relay_postal_code, relay_city, relay_latitude, relay_longitude,
    weight_grams, shipping_amount, currency, merchandise_subtotal_minor_amount,
    recipient_snapshot, seller_fulfillment_snapshot, relay_snapshot,
    request_snapshot, quoted_at, expires_at, created_at
)
select
    'mrq_' || pg_catalog.repeat(marker, 64), 'relay-selection-' || marker,
    'relay-quote-order', 7, revision, actor, actor,
    'FR-' || pg_catalog.repeat(marker, 6), 'FR', pg_catalog.repeat(marker, 6),
    'QUOTE ' || revision, revision || ' RUE DE LA QUOTE', '', '75002',
    'PARIS', 48.87, 2.35, 750, 550, 'eur', 12345,
    '{}', '{}', '{"nature":"C","pointType":"locker"}', '{}',
    '2026-07-20 10:00:00+00'::timestamptz + revision * interval '1 minute',
    '2099-07-20 11:00:00+00',
    '2026-07-20 10:00:00+00'::timestamptz + revision * interval '1 minute'
from (values
    ('1', 1, 'buyer-123'),
    ('3', 3, 'buyer-123'),
    ('9', 9, 'another-user')
) fixture(marker, revision, actor);

do $behavior$
declare
    context jsonb;
begin
    context := delivery.read_relay_selection_context('relay-selection-wins', 'buyer-123');
    if context #>> '{outcome}' <> 'selection'
       or context #>> '{row,relay_name}' <> 'SELECTED RELAY' then
        raise exception 'relay selection: saved selection did not win: %', context;
    end if;
    context := delivery.read_relay_selection_context('relay-quote-order', 'buyer-123');
    if context #>> '{outcome}' <> 'quote'
       or context #>> '{row,revision}' <> '3'
       or context #>> '{row,selected_for_cms_user_id}' <> 'buyer-123'
       or context #> '{row}' ?| array[
            'recipient_snapshot', 'seller_fulfillment_snapshot', 'request_snapshot'
       ] then
        raise exception 'relay selection: latest actor quote changed: %', context;
    end if;
    context := delivery.read_relay_selection_context('relay-quote-order', null);
    if context <> '{"outcome":"missing","row":null}'::jsonb then
        raise exception 'relay selection: missing actor must not receive a quote: %', context;
    end if;
end;
$behavior$;

revoke select on delivery.delivery_quotes from service_role;
set local role service_role;
do $conditional$
declare
    context jsonb;
begin
    context := delivery.read_relay_selection_context('relay-selection-wins', 'buyer-123');
    if context #>> '{outcome}' <> 'selection' then
        raise exception 'relay selection: selected path changed with quotes unavailable';
    end if;
    context := delivery.read_relay_selection_context('missing-order', null);
    if context #>> '{outcome}' <> 'missing' then
        raise exception 'relay selection: actorless path consulted quotes';
    end if;
    begin
        perform delivery.read_relay_selection_context('missing-order', 'buyer-123');
        raise exception 'relay selection: user fallback did not consult quotes';
    exception
        when insufficient_privilege then null;
    end;
end;
$conditional$;
reset role;

rollback;

\ir freshness.sql
