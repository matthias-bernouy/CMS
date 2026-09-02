

create or replace function delivery.complete_shipment_event_projection(
    p_event_id bigint,
    p_claim_token uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    v_updated bigint;
begin
    update delivery.shipment_events
    set commerce_projected_at = now(),
        projection_status = 'projected',
        projection_claimed_at = null,
        projection_claimed_by = null,
        projection_claim_token = null,
        projection_last_error = null,
        projection_manual_review_at = null
    where id = p_event_id and projection_status = 'processing'
      and projection_claim_token = p_claim_token and commerce_projected_at is null
    returning id into v_updated;
    return v_updated is not null;
end;
$$;