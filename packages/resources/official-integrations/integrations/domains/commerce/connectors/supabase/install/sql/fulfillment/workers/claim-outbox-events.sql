

create or replace function commerce.claim_outbox_events(
    p_worker_id text,
    p_limit integer default 25
)
returns jsonb
language sql
set search_path = ''
as $$
with claimed as (
    select id from commerce.outbox_events
    where status in ('pending', 'failed') and available_at <= now()
    order by available_at, id
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
), updated as (
    update commerce.outbox_events event set
        status = 'processing', claimed_at = now(), claimed_by = p_worker_id,
        attempts = attempts + 1
    from claimed where event.id = claimed.id
    returning event.*
)
select coalesce(jsonb_agg(to_jsonb(updated) order by id), '[]'::jsonb) from updated;
$$;