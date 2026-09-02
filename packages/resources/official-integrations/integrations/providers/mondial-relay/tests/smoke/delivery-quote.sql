-- Mondial Relay delivery quote database smoke contract.
\set ON_ERROR_STOP on

begin;
set local role service_role;

do $$
declare
    first_quote delivery.delivery_quotes%rowtype;
    replay delivery.delivery_quotes%rowtype;
    competing_quote delivery.delivery_quotes%rowtype;
begin
    select * into first_quote from delivery.reserve_delivery_quote(
        'mrq_' || repeat('a', 64), 'order-42:v1:relay-a', 'order-42', 1,
        'buyer-42', 'buyer-42', 'FR-024474', 'FR', '024474', 'Relay A',
        '1 rue du Relais', '', '75001', 'Paris', null, null,
        500, 450, 'eur', 12345,
        '{"name":"Buyer"}'::jsonb, '{"name":"Seller"}'::jsonb,
        '{"location":"FR-024474"}'::jsonb, '{"relay":"a"}'::jsonb, 900
    );
    select * into replay from delivery.reserve_delivery_quote(
        'mrq_' || repeat('a', 64), 'order-42:v1:relay-a', 'order-42', 1,
        'buyer-42', 'buyer-42', 'FR-024474', 'FR', '024474', 'Relay A',
        '1 rue du Relais', '', '75001', 'Paris', null, null,
        500, 450, 'eur', 12345,
        '{"name":"Buyer"}'::jsonb, '{"name":"Seller"}'::jsonb,
        '{"location":"FR-024474"}'::jsonb, '{"relay":"a"}'::jsonb, 900
    );
    select * into competing_quote from delivery.reserve_delivery_quote(
        'mrq_' || repeat('b', 64), 'order-42:v1:relay-b', 'order-42', 1,
        'buyer-42', 'buyer-42', 'FR-031270', 'FR', '031270', 'Relay B',
        '2 rue du Relais', '', '75002', 'Paris', null, null,
        500, 450, 'eur', 12345,
        '{"name":"Buyer"}'::jsonb, '{"name":"Seller"}'::jsonb,
        '{"location":"FR-031270"}'::jsonb, '{"relay":"b"}'::jsonb, 900
    );
    if first_quote.quote_id <> replay.quote_id or first_quote.revision <> 1 then
        raise exception 'quote replay was not stable';
    end if;
    if competing_quote.revision <> 2 or competing_quote.quote_id = first_quote.quote_id then
        raise exception 'competing quote did not retain an independent immutable revision';
    end if;
    begin
        perform delivery.reserve_delivery_quote(
            'mrq_' || repeat('a', 64), 'order-42:v1:relay-a', 'order-42', 1,
            'buyer-42', 'buyer-42', 'FR-024474', 'FR', '024474', 'Relay A',
            '1 rue du Relais', '', '75001', 'Paris', null, null,
            500, 450, 'eur', 12345,
            '{"name":"Buyer"}'::jsonb, '{"name":"Seller changed"}'::jsonb,
            '{"location":"FR-024474"}'::jsonb, '{"relay":"changed"}'::jsonb, 900
        );
        raise exception 'changed replay unexpectedly succeeded';
    exception when others then
        if sqlerrm not like 'conflict: delivery quote request replay changed immutable input%' then raise; end if;
    end;
end;
$$;

insert into delivery.shipments (
    id, external_order_id, idempotency_key, status, provider_call_started_at,
    delivery_quote_id, delivery_relay_country, delivery_relay_number,
    recipient_name, recipient_address_line1, recipient_postal_code, recipient_city,
    recipient_country, weight_grams, declared_value_minor_amount, declared_currency
) values (
    'shipment-42', 'order-42', 'order-42', 'creating', now(),
    'mrq_' || repeat('a', 64), 'FR', 'FR-024474',
    'Buyer', '1 rue', '75001', 'Paris', 'FR', 500, 12345, 'EUR'
);

insert into delivery.shipments (
    id, external_order_id, idempotency_key, status, provider_call_started_at,
    recipient_name, recipient_address_line1, recipient_postal_code, recipient_city,
    recipient_country, weight_grams, declared_value_minor_amount, declared_currency
) values (
    'shipment-stale', 'claim-return:7', 'claim-return:7', 'creating', now() - interval '30 minutes',
    'Seller', '2 rue', '69001', 'Lyon', 'FR', 500, 12345, 'EUR'
);

select count(*) as stale_marked
from delivery.mark_stale_shipment_creations_unknown(8, 1200)
having count(*) = 1;

do $$
begin
    if not exists (
        select 1 from delivery.shipments
        where id = 'shipment-stale' and status = 'unknown' and creation_manual_review_at is not null
    ) then raise exception 'stale creation was not quarantined'; end if;
    if exists (select 1 from delivery.shipments where id = 'shipment-42' and status <> 'creating') then
        raise exception 'active creation was poisoned by stale recovery';
    end if;
end;
$$;

rollback;
