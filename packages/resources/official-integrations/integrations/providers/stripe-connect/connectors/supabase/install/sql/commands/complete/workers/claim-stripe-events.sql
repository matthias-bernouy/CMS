

create or replace function stripe_connect.claim_stripe_events(p_limit integer default 50)
returns setof stripe_connect.stripe_events
language plpgsql
set search_path = ''
as $$
begin
    return query
    with candidates as (
        select event.id
        from stripe_connect.stripe_events as event
        where (
                event.processing_status in ('pending', 'failed')
                or (
                    event.processing_status = 'processing'
                    and event.processing_started_at <= now() - interval '5 minutes'
                )
            )
          and event.attempt_count < 5
        order by event.received_at asc
        for update skip locked
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    update stripe_connect.stripe_events as event
    set processing_status = 'processing',
        processing_started_at = now(),
        attempt_count = event.attempt_count + 1,
        last_error = null
    from candidates
    where event.id = candidates.id
    returning event.*;
end;
$$;
