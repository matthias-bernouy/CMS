

create or replace function delivery.review_shipment_event_projection(
    p_event_id bigint,
    p_action text,
    p_actor_cms_user_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_event delivery.shipment_events%rowtype;
    v_previous_status text;
begin
    if p_action not in ('requeue', 'resolve_duplicate')
        or p_actor_cms_user_id is null or length(btrim(p_actor_cms_user_id)) = 0
        or p_reason is null or length(btrim(p_reason)) < 8 then
        raise exception 'validation: invalid projection review action';
    end if;
    select * into v_event from delivery.shipment_events where id = p_event_id for update;
    if not found then raise exception 'not_found: shipment event'; end if;
    if v_event.projection_status <> 'manual_review' then
        raise exception 'conflict: only a manual-review projection can be reviewed';
    end if;
    v_previous_status := v_event.projection_status;
    if p_action = 'resolve_duplicate' then
        if not exists (
            select 1 from delivery.shipment_events projected
            where projected.shipment_id = v_event.shipment_id
              and projected.id <> v_event.id
              and projected.projection_status = 'projected'
              and projected.commerce_projected_at is not null
              and projected.normalized_status is not distinct from v_event.normalized_status
              and projected.occurred_at is not distinct from v_event.occurred_at
        ) then
            raise exception 'conflict: no safely projected duplicate exists';
        end if;
        update delivery.shipment_events set
            projection_status = 'projected', commerce_projected_at = now(),
            projection_claimed_at = null, projection_claimed_by = null,
            projection_claim_token = null,
            projection_last_error = 'resolved as an audited duplicate: ' || left(btrim(p_reason), 1900),
            projection_manual_review_at = null
        where id = v_event.id returning * into v_event;
    else
        update delivery.shipment_events set
            projection_status = 'retry_wait', projection_attempts = 0,
            projection_next_attempt_at = now(), projection_claimed_at = null,
            projection_claimed_by = null, projection_claim_token = null,
            projection_last_error = 'operator requeue: ' || left(btrim(p_reason), 1900),
            projection_manual_review_at = null
        where id = v_event.id returning * into v_event;
    end if;
    insert into delivery.projection_review_actions (
        shipment_event_id, action, actor_cms_user_id, reason,
        previous_status, resulting_status
    ) values (
        v_event.id, p_action, p_actor_cms_user_id, btrim(p_reason),
        v_previous_status, v_event.projection_status
    );
    return to_jsonb(v_event);
end;
$$;