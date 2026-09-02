

create or replace function delivery.fail_shipment_event_projection(
    p_event_id bigint,
    p_claim_token uuid,
    p_error text,
    p_retry_delay_seconds integer default 60,
    p_max_attempts integer default 5
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_event delivery.shipment_events%rowtype;
begin
    if p_error is null or length(btrim(p_error)) = 0 or p_retry_delay_seconds < 1
        or p_retry_delay_seconds > 86400 or p_max_attempts < 1 or p_max_attempts > 20 then
        raise exception 'validation: invalid projection failure';
    end if;
    select * into v_event from delivery.shipment_events
    where id = p_event_id for update;
    if not found then raise exception 'not_found: shipment event'; end if;
    if v_event.projection_status = 'projected' and v_event.commerce_projected_at is not null then
        return to_jsonb(v_event);
    end if;
    if v_event.projection_status <> 'processing' or v_event.projection_claim_token is distinct from p_claim_token then
        raise exception 'conflict: shipment event projection lease mismatch';
    end if;
    update delivery.shipment_events
    set projection_status = case when v_event.projection_attempts >= p_max_attempts then 'manual_review' else 'retry_wait' end,
        projection_next_attempt_at = case when v_event.projection_attempts >= p_max_attempts
            then projection_next_attempt_at else now() + make_interval(secs => p_retry_delay_seconds) end,
        projection_claimed_at = null,
        projection_claimed_by = null,
        projection_claim_token = null,
        projection_last_error = left(btrim(p_error), 2000),
        projection_manual_review_at = case when v_event.projection_attempts >= p_max_attempts then now() else null end
    where id = p_event_id
    returning * into v_event;
    return to_jsonb(v_event);
end;
$$;