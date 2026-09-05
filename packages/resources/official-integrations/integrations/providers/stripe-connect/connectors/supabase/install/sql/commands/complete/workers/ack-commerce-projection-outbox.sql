

create or replace function stripe_connect.ack_commerce_projection_outbox(
    p_projection_id bigint,
    p_claim_token uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_projection stripe_connect.commerce_projection_outbox%rowtype;
begin
    update stripe_connect.commerce_projection_outbox
    set projection_status = 'succeeded', projected_at = now(),
        claim_owner = null, claim_token = null, claimed_at = null,
        next_attempt_at = null, last_error = null
    where id = p_projection_id
      and projection_status = 'leased'
      and claim_token = p_claim_token
    returning * into v_projection;
    if not found then raise exception 'conflict: projection lease is no longer valid'; end if;
    update stripe_connect.provider_exceptions
    set status = 'resolved', resolved_at = now(), resolved_by = 'commerce-projection-ack'
    where deduplication_key = 'commerce-projection:' || v_projection.id
      and status <> 'resolved';
    return to_jsonb(v_projection);
end;
$$;
