

create or replace function stripe_connect.claim_commerce_projection_outbox(
    p_owner text,
    p_limit integer default 50
)
returns setof stripe_connect.commerce_projection_outbox
language plpgsql
set search_path = ''
as $$
begin
    if nullif(btrim(p_owner), '') is null then
        raise exception 'validation: projection claim owner is required';
    end if;
    return query
    with candidates as (
        select projection.id
        from stripe_connect.commerce_projection_outbox projection
        where ((
                projection.projection_status in ('pending', 'retry')
                and (projection.next_attempt_at is null or projection.next_attempt_at <= now())
            ) or (
                projection.projection_status = 'leased'
                and projection.claimed_at <= now() - interval '5 minutes'
            ))
          and not (
              projection.projection_kind = 'refund'
              and projection.recovery_key is not null
              and exists (
                  select 1
                  from stripe_connect.commerce_projection_outbox predecessor
                  where predecessor.recovery_key = projection.recovery_key
                    and predecessor.projection_kind = 'reversal'
                    and predecessor.causal_sequence < projection.causal_sequence
                  and predecessor.projection_status <> 'succeeded'
              )
          )
          and not (
              projection.projection_kind = 'refund'
              and exists (
                  select 1
                  from stripe_connect.commerce_projection_outbox predecessor
                  where predecessor.operation_id = projection.operation_id
                    and predecessor.projection_kind = 'refund'
                    and predecessor.causal_sequence < projection.causal_sequence
                    and predecessor.projection_status <> 'succeeded'
              )
          )
        order by projection.created_at, projection.causal_sequence, projection.id
        for update skip locked
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    update stripe_connect.commerce_projection_outbox projection
    set projection_status = 'leased',
        claim_owner = p_owner,
        claim_token = pg_catalog.gen_random_uuid(),
        claimed_at = now(),
        attempt_count = projection.attempt_count + 1,
        last_error = null
    from candidates
    where projection.id = candidates.id
    returning projection.*;
end;
$$;