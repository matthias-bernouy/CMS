

create or replace function stripe_connect.fail_commerce_projection_outbox(
    p_projection_id bigint,
    p_claim_token uuid,
    p_error text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_projection stripe_connect.commerce_projection_outbox%rowtype;
begin
    if nullif(btrim(p_error), '') is null then
        raise exception 'validation: projection failure reason is required';
    end if;
    update stripe_connect.commerce_projection_outbox
    set projection_status = case when attempt_count >= 5 then 'manual_review' else 'retry' end,
        next_attempt_at = case when attempt_count >= 5 then null
            else now() + make_interval(secs => least(300, pg_catalog.power(2, attempt_count)::integer)) end,
        claim_owner = null, claim_token = null, claimed_at = null,
        last_error = left(p_error, 2000)
    where id = p_projection_id
      and projection_status = 'leased'
      and claim_token = p_claim_token
    returning * into v_projection;
    if not found then raise exception 'conflict: projection lease is no longer valid'; end if;
    if v_projection.projection_status = 'manual_review' then
        insert into stripe_connect.provider_exceptions (
            deduplication_key, payment_id, operation_id, exception_type,
            severity, status, message, details
        ) values (
            'commerce-projection:' || v_projection.id,
            v_projection.payment_id,
            v_projection.operation_id,
            'commerce_projection_delivery_failed',
            'critical', 'open',
            'Commerce projection exhausted automatic delivery retries',
            jsonb_build_object(
                'projectionId', v_projection.id,
                'projectionKey', v_projection.projection_key,
                'projectionKind', v_projection.projection_kind,
                'attemptCount', v_projection.attempt_count,
                'interventionRevision', v_projection.intervention_revision,
                'lastError', v_projection.last_error
            )
        ) on conflict (deduplication_key) where deduplication_key is not null do update
        set status = 'open', resolved_at = null, resolved_by = null,
            message = excluded.message, details = excluded.details,
            operation_id = excluded.operation_id, payment_id = excluded.payment_id;
    end if;
    return to_jsonb(v_projection);
end;
$$;