

create or replace function delivery.reserve_delivery_quote(
    p_quote_id text,
    p_request_key text,
    p_external_order_id text,
    p_order_version integer,
    p_selected_by text,
    p_selected_for_cms_user_id text,
    p_relay_location text,
    p_relay_country text,
    p_relay_number text,
    p_relay_name text,
    p_relay_address_line1 text,
    p_relay_address_line2 text,
    p_relay_postal_code text,
    p_relay_city text,
    p_relay_latitude double precision,
    p_relay_longitude double precision,
    p_weight_grams integer,
    p_shipping_amount bigint,
    p_currency text,
    p_merchandise_subtotal_minor_amount bigint,
    p_recipient_snapshot jsonb,
    p_seller_fulfillment_snapshot jsonb,
    p_relay_snapshot jsonb,
    p_request_snapshot jsonb,
    p_ttl_seconds integer default 900
)
returns delivery.delivery_quotes
language plpgsql
set search_path = ''
as $$
declare
    v_existing delivery.delivery_quotes%rowtype;
    v_revision integer;
begin
    perform pg_advisory_xact_lock(hashtextextended('delivery-quote-request:' || p_request_key, 0));
    select * into v_existing from delivery.delivery_quotes where request_key = p_request_key;
    if found then
        if v_existing.quote_id <> p_quote_id
            or v_existing.external_order_id <> p_external_order_id
            or v_existing.order_version <> p_order_version
            or v_existing.selected_by <> p_selected_by
            or v_existing.selected_for_cms_user_id <> p_selected_for_cms_user_id
            or v_existing.request_snapshot <> p_request_snapshot then
            raise exception 'conflict: delivery quote request replay changed immutable input';
        end if;
        return v_existing;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('delivery-quote-order:' || p_external_order_id, 0));
    select coalesce(max(revision), 0) + 1 into v_revision
    from delivery.delivery_quotes where external_order_id = p_external_order_id;
    insert into delivery.delivery_quotes (
        quote_id, request_key, external_order_id, order_version, revision,
        selected_by, selected_for_cms_user_id,
        relay_location, relay_country, relay_number, relay_name,
        relay_address_line1, relay_address_line2, relay_postal_code, relay_city,
        relay_latitude, relay_longitude, weight_grams, shipping_amount, currency,
        merchandise_subtotal_minor_amount, recipient_snapshot,
        seller_fulfillment_snapshot, relay_snapshot, request_snapshot, expires_at
    ) values (
        p_quote_id, p_request_key, p_external_order_id, p_order_version, v_revision,
        p_selected_by, p_selected_for_cms_user_id,
        p_relay_location, p_relay_country, p_relay_number, p_relay_name,
        p_relay_address_line1, coalesce(p_relay_address_line2, ''), p_relay_postal_code, p_relay_city,
        p_relay_latitude, p_relay_longitude, p_weight_grams, p_shipping_amount, lower(p_currency),
        p_merchandise_subtotal_minor_amount, p_recipient_snapshot,
        p_seller_fulfillment_snapshot, p_relay_snapshot, p_request_snapshot,
        now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 900), 60), 3600))
    ) returning * into v_existing;
    return v_existing;
end;
$$;