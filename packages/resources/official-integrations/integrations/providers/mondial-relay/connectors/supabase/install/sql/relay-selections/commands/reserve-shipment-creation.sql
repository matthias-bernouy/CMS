

create or replace function delivery.reserve_shipment_creation(
    p_reservation jsonb,
    p_quote_check jsonb,
    p_quote_purpose text,
    p_quote_external_order_id text,
    p_selected_for_cms_user_id text,
    p_observed_at timestamptz
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_candidate delivery.shipments%rowtype;
    v_existing delivery.shipments%rowtype;
    v_quote delivery.delivery_quotes%rowtype;
    v_selection delivery.relay_selections%rowtype;
    v_expected_sender jsonb;
    v_expected_recipient jsonb;
    v_delivery_quote_id text;
    v_external_order_id text;
    v_has_quote boolean := false;
begin
    if pg_catalog.jsonb_typeof(p_reservation) is distinct from 'object'
        or pg_catalog.jsonb_typeof(p_quote_check) is distinct from 'object'
    then
        raise exception 'validation: shipment reservation context is invalid';
    end if;
    v_delivery_quote_id := p_reservation->>'delivery_quote_id';
    v_external_order_id := p_reservation->>'external_order_id';

    if v_delivery_quote_id is not null then
        select quote.* into v_quote
        from delivery.delivery_quotes quote
        where quote.quote_id = v_delivery_quote_id;
        v_has_quote := found;
    end if;
    if v_external_order_id !~ '^claim-return:' and not v_has_quote then
        raise exception 'conflict: an exact immutable delivery quote is required before shipment creation';
    end if;
    if v_delivery_quote_id is not null and (
        not v_has_quote
        or v_quote.external_order_id is distinct from p_quote_external_order_id
        or v_quote.selected_for_cms_user_id is distinct from p_selected_for_cms_user_id
    ) then
        raise exception 'conflict: shipment delivery quote binding is invalid';
    end if;

    if v_has_quote then
        if p_quote_purpose = 'fulfillment'
            and p_quote_external_order_id is distinct from p_quote_check->>'externalOrderId'
        then
            raise exception 'conflict: main shipment delivery quote belongs to another order';
        end if;
        if p_quote_purpose = 'fulfillment' and (
            v_quote.relay_location is distinct from p_quote_check->>'deliveryRelayLocation'
            or v_quote.weight_grams is distinct from (p_quote_check->>'weightGrams')::numeric
            or v_quote.merchandise_subtotal_minor_amount
                is distinct from (p_quote_check->>'declaredValueMinorAmount')::numeric
            or pg_catalog.upper(v_quote.currency)
                is distinct from p_quote_check->>'declaredCurrency'
        ) then
            raise exception 'conflict: shipment financial or relay input does not match the immutable quote';
        end if;

        v_expected_sender := case when p_quote_purpose = 'claim_return'
            then v_quote.recipient_snapshot else v_quote.seller_fulfillment_snapshot end;
        v_expected_recipient := case when p_quote_purpose = 'claim_return'
            then v_quote.seller_fulfillment_snapshot else v_quote.recipient_snapshot end;
        if not delivery.shipment_address_matches(p_quote_check->'sender', v_expected_sender)
            or not delivery.shipment_address_matches(p_quote_check->'recipient', v_expected_recipient)
        then
            raise exception 'conflict: shipment address input does not match the immutable quote snapshot';
        end if;
    else
        select selection.* into v_selection
        from delivery.relay_selections selection
        where selection.external_order_id = v_external_order_id;
        if found and v_selection.relay_location
            is distinct from p_quote_check->>'deliveryRelayLocation'
        then
            raise exception 'conflict: shipment relay does not match the immutable server selection';
        end if;
    end if;

    v_candidate := pg_catalog.jsonb_populate_record(null::delivery.shipments, p_reservation);
    v_candidate := delivery.normalize_shipment_reservation(v_candidate, p_quote_check, p_reservation);
    v_candidate.provider_call_started_at := p_observed_at;
    if not delivery.shipment_reservation_matches(v_candidate, p_quote_check) then
        raise exception 'conflict: shipment reservation does not match validated quote context';
    end if;

    insert into delivery.shipments (
        id, external_order_id, idempotency_key, status, provider_call_started_at,
        creation_manual_review_at, seller_cms_user_id, delivery_quote_id,
        label_format, mode_collection, mode_delivery, delivery_relay_country,
        delivery_relay_number, sender_name, sender_email, sender_phone,
        sender_address_line1, sender_address_line2, sender_address_line3,
        sender_postal_code, sender_city, sender_country, recipient_name,
        recipient_email, recipient_phone, recipient_address_line1,
        recipient_address_line2, recipient_address_line3, recipient_postal_code,
        recipient_city, recipient_country, weight_grams,
        declared_value_minor_amount, declared_currency, package_count, length_cm,
        instructions, metadata, raw_request, raw_response, created_by
    ) values (
        v_candidate.id, v_candidate.external_order_id, v_candidate.idempotency_key,
        v_candidate.status, v_candidate.provider_call_started_at,
        v_candidate.creation_manual_review_at, v_candidate.seller_cms_user_id,
        v_candidate.delivery_quote_id, v_candidate.label_format,
        v_candidate.mode_collection, v_candidate.mode_delivery,
        v_candidate.delivery_relay_country, v_candidate.delivery_relay_number,
        v_candidate.sender_name, v_candidate.sender_email, v_candidate.sender_phone,
        v_candidate.sender_address_line1, v_candidate.sender_address_line2,
        v_candidate.sender_address_line3, v_candidate.sender_postal_code,
        v_candidate.sender_city, v_candidate.sender_country, v_candidate.recipient_name,
        v_candidate.recipient_email, v_candidate.recipient_phone,
        v_candidate.recipient_address_line1, v_candidate.recipient_address_line2,
        v_candidate.recipient_address_line3, v_candidate.recipient_postal_code,
        v_candidate.recipient_city, v_candidate.recipient_country,
        v_candidate.weight_grams, v_candidate.declared_value_minor_amount,
        v_candidate.declared_currency, v_candidate.package_count,
        v_candidate.length_cm, v_candidate.instructions, v_candidate.metadata,
        v_candidate.raw_request, v_candidate.raw_response, v_candidate.created_by
    ) on conflict (idempotency_key) do nothing
    returning * into v_existing;

    if found then
        return delivery.shipment_creation_result('provider_required', v_existing);
    end if;

    select shipment.* into v_existing
    from delivery.shipments shipment
    where shipment.idempotency_key = v_candidate.idempotency_key;
    if not found then
        raise exception 'conflict: shipment creation reservation was not acquired';
    end if;
    if v_existing.raw_request is distinct from v_candidate.raw_request then
        raise exception 'conflict: idempotency key was already used with a different shipment payload';
    end if;

    if v_existing.status = 'failed' then
        v_existing := delivery.retry_shipment_creation(
            v_existing.id, p_reservation, p_observed_at
        );
        return delivery.shipment_creation_result('provider_required', v_existing);
    end if;

    if v_existing.status = 'creating' then
        return delivery.shipment_creation_result('creating', v_existing);
    end if;

    return delivery.shipment_creation_result(
        case when v_existing.status = 'unknown' then 'unknown' else 'replay' end,
        v_existing
    );
end;
$$;