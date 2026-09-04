

create or replace function delivery.claim_pending_shipment_events(
    p_worker_id text,
    p_limit integer default 12,
    p_lease_seconds integer default 300,
    p_max_attempts integer default 5
)
returns setof jsonb
language plpgsql
set search_path = ''
as $$
begin
    if p_worker_id is null or length(btrim(p_worker_id)) = 0 then
        raise exception 'validation: worker id is required';
    end if;
    if p_limit < 1 or p_limit > 24 or p_lease_seconds < 30 or p_lease_seconds > 3600
        or p_max_attempts < 1 or p_max_attempts > 20 then
        raise exception 'validation: invalid projection claim settings';
    end if;

    update delivery.shipment_events event
    set projection_status = case when event.projection_attempts >= p_max_attempts then 'manual_review' else 'retry_wait' end,
        projection_next_attempt_at = now(),
        projection_claimed_at = null,
        projection_claimed_by = null,
        projection_claim_token = null,
        projection_last_error = left(coalesce(event.projection_last_error || '; ', '') || 'projection lease expired before acknowledgement', 2000),
        projection_manual_review_at = case when event.projection_attempts >= p_max_attempts then now() else event.projection_manual_review_at end
    where event.projection_status = 'processing'
      and event.projection_claimed_at < now() - make_interval(secs => p_lease_seconds);

    return query
    with candidates as materialized (
        select event.id
        from delivery.shipment_events event
        where event.normalized_status is not null
          and event.commerce_projected_at is null
          and event.projection_status in ('pending', 'retry_wait')
          and event.projection_next_attempt_at <= now()
          and event.projection_attempts < p_max_attempts
          and not exists (
              select 1 from delivery.shipment_events predecessor
              where predecessor.shipment_id = event.shipment_id
                and predecessor.normalized_status is not null
                and predecessor.commerce_projected_at is null
                and predecessor.id <> event.id
                and (
                    coalesce(predecessor.occurred_at, predecessor.created_at),
                    predecessor.created_at, predecessor.id
                ) < (
                    coalesce(event.occurred_at, event.created_at),
                    event.created_at, event.id
                )
          )
        order by coalesce(event.occurred_at, event.created_at), event.created_at, event.id
        for update skip locked
        limit p_limit
    ), claimed as (
        update delivery.shipment_events event
        set projection_status = 'processing',
            projection_attempts = event.projection_attempts + 1,
            projection_claimed_at = now(),
            projection_claimed_by = p_worker_id,
            projection_claim_token = gen_random_uuid(),
            projection_last_error = null
        from candidates
        where event.id = candidates.id
        returning event.*
    )
    select to_jsonb(claimed) from claimed order by claimed.created_at, claimed.id;
end;
$$;