

create or replace function delivery.retry_shipment_creation(
    p_existing_id text,
    p_reservation jsonb,
    p_observed_at timestamptz
)
returns delivery.shipments
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_candidate delivery.shipments%rowtype;
    v_existing delivery.shipments%rowtype;
begin
    select shipment.* into v_existing
    from delivery.shipments shipment
    where shipment.id = p_existing_id;
    if not found then
        raise exception 'conflict: shipment creation is already being retried';
    end if;
    v_candidate := pg_catalog.jsonb_populate_record(v_existing, p_reservation);
    update delivery.shipments shipment set
        external_order_id = v_candidate.external_order_id,
        status = 'creating', last_error = null,
        provider_call_started_at = p_observed_at,
        creation_manual_review_at = v_candidate.creation_manual_review_at,
        seller_cms_user_id = v_candidate.seller_cms_user_id,
        delivery_quote_id = v_candidate.delivery_quote_id,
        label_format = v_candidate.label_format,
        mode_collection = v_candidate.mode_collection,
        mode_delivery = v_candidate.mode_delivery,
        delivery_relay_country = v_candidate.delivery_relay_country,
        delivery_relay_number = v_candidate.delivery_relay_number,
        sender_name = v_candidate.sender_name,
        sender_email = v_candidate.sender_email,
        sender_phone = v_candidate.sender_phone,
        sender_address_line1 = v_candidate.sender_address_line1,
        sender_address_line2 = v_candidate.sender_address_line2,
        sender_address_line3 = v_candidate.sender_address_line3,
        sender_postal_code = v_candidate.sender_postal_code,
        sender_city = v_candidate.sender_city,
        sender_country = v_candidate.sender_country,
        recipient_name = v_candidate.recipient_name,
        recipient_email = v_candidate.recipient_email,
        recipient_phone = v_candidate.recipient_phone,
        recipient_address_line1 = v_candidate.recipient_address_line1,
        recipient_address_line2 = v_candidate.recipient_address_line2,
        recipient_address_line3 = v_candidate.recipient_address_line3,
        recipient_postal_code = v_candidate.recipient_postal_code,
        recipient_city = v_candidate.recipient_city,
        recipient_country = v_candidate.recipient_country,
        weight_grams = v_candidate.weight_grams,
        declared_value_minor_amount = v_candidate.declared_value_minor_amount,
        declared_currency = v_candidate.declared_currency,
        package_count = v_candidate.package_count,
        length_cm = v_candidate.length_cm,
        instructions = v_candidate.instructions,
        metadata = v_candidate.metadata,
        raw_request = v_candidate.raw_request,
        raw_response = v_candidate.raw_response,
        created_by = v_candidate.created_by
    where shipment.id = p_existing_id and shipment.status = 'failed'
    returning shipment.* into v_existing;
    if not found then
        raise exception 'conflict: shipment creation is already being retried';
    end if;
    return v_existing;
end;
$$;