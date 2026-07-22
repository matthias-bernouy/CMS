

create or replace function delivery.cancel_shipment_unscanned(
    p_external_order_id text,
    p_tracking_until timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_shipment delivery.shipments%rowtype;
begin
    select * into v_shipment from delivery.shipments
    where external_order_id = p_external_order_id for update;
    if not found then raise exception 'not_found: shipment'; end if;
    if v_shipment.status in ('cancelled_unscanned', 'cancelled') then
        if p_tracking_until is distinct from v_shipment.cancellation_tracking_until then
            raise exception 'conflict: cancellation replay changed the tracking deadline';
        end if;
        return to_jsonb(v_shipment) || jsonb_build_object('idempotentReplay', true);
    end if;
    if p_tracking_until is null or p_tracking_until <= now() then
        raise exception 'validation: cancellation tracking deadline must be in the future';
    end if;
    if v_shipment.tracking_claimed_at is not null
        and v_shipment.tracking_claimed_at > now() - interval '20 minutes' then
        raise exception 'conflict: active carrier reconciliation prevents cancellation';
    end if;
    if v_shipment.seller_handoff_declared_at is not null or v_shipment.carrier_accepted_at is not null
        or v_shipment.status not in ('created', 'label_ready', 'failed') then
        raise exception 'conflict: shipment can no longer be cancelled before carrier reconciliation';
    end if;
    update delivery.shipments set
        status = 'cancelled_unscanned', cancellation_tracking_until = p_tracking_until,
        tracking_next_attempt_at = now(), tracking_claimed_at = null,
        tracking_claimed_by = null, last_error = null
    where id = v_shipment.id returning * into v_shipment;
    update delivery.label_access_tokens set revoked_at = coalesce(revoked_at, now())
    where shipment_id = v_shipment.id and revoked_at is null;
    return to_jsonb(v_shipment) || jsonb_build_object('idempotentReplay', false);
end;
$$;