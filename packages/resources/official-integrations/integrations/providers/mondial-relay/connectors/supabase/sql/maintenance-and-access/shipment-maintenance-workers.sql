

create or replace function delivery.claim_due_shipments(
    p_worker_id text,
    p_limit integer default 24
)
returns setof delivery.shipments
language plpgsql
set search_path = ''
as $$
begin
    if p_worker_id is null or length(btrim(p_worker_id)) = 0 then
        raise exception 'validation: tracking worker id is required';
    end if;
    return query
    with candidates as (
        select shipment.id
        from delivery.shipments shipment
        where shipment.status in (
                'created', 'label_ready', 'carrier_accepted', 'in_transit',
                'arrived_at_pickup_point', 'available_for_pickup', 'pickup_expired',
                'returning_to_sender', 'incident', 'cancelled_unscanned'
            )
          and shipment.expedition_number is not null
          and (
              shipment.tracking_next_attempt_at <= now()
              or (
                  shipment.tracking_next_attempt_at is null
                  and (
                      shipment.tracking_checked_at is null
                      or shipment.tracking_checked_at <= now() - interval '4 hours'
                  )
              )
          )
          and (
              shipment.tracking_claimed_at is null
              or shipment.tracking_claimed_at <= now() - interval '20 minutes'
          )
        order by shipment.tracking_next_attempt_at asc nulls first,
                 shipment.tracking_checked_at asc nulls first,
                 shipment.created_at,
                 shipment.id
        for update skip locked
        limit least(greatest(coalesce(p_limit, 24), 1), 24)
    )
    update delivery.shipments shipment
    set tracking_claimed_at = now(),
        tracking_claimed_by = p_worker_id
    from candidates
    where shipment.id = candidates.id
    returning shipment.*;
end;
$$;

create or replace function delivery.mark_stale_shipment_creations_unknown(
    p_limit integer default 24,
    p_stale_seconds integer default 1200
)
returns setof delivery.shipments
language plpgsql
set search_path = ''
as $$
begin
    return query
    with candidates as (
        select shipment.id
        from delivery.shipments shipment
        where shipment.status = 'creating'
          and shipment.provider_call_started_at <= now()
              - make_interval(secs => least(greatest(coalesce(p_stale_seconds, 1200), 300), 86400))
        order by shipment.provider_call_started_at, shipment.created_at, shipment.id
        for update skip locked
        limit least(greatest(coalesce(p_limit, 24), 1), 24)
    )
    update delivery.shipments shipment
    set status = 'unknown',
        creation_manual_review_at = coalesce(shipment.creation_manual_review_at, now()),
        last_error = 'shipment creation lease expired before a provider outcome was attached'
    from candidates
    where shipment.id = candidates.id
    returning shipment.*;
end;
$$;