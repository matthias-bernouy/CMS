create or replace function commerce.complete_notification(
    p_delivery_id uuid,
    p_run_key text,
    p_message_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_delivery commerce.notification_deliveries%rowtype;
begin
    update commerce.notification_deliveries
    set status = 'delivered',
        provider_message_id = nullif(p_message_id, ''),
        claimed_by = null,
        claim_expires_at = null,
        last_error = null,
        delivered_at = now(),
        updated_at = now()
    where id = p_delivery_id and status = 'processing' and claimed_by = p_run_key
    returning * into v_delivery;
    if not found then
        raise exception 'conflict: notification delivery claim is not owned by this worker';
    end if;
    return to_jsonb(v_delivery);
end;
$$;

create or replace function commerce.fail_notification(
    p_delivery_id uuid,
    p_run_key text,
    p_error text,
    p_retryable boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_delivery commerce.notification_deliveries%rowtype;
begin
    update commerce.notification_deliveries
    set status = case when p_retryable and attempts < 6 then 'retry' else 'dead_letter' end,
        available_at = case when p_retryable and attempts < 6
            then now() + make_interval(secs => least(3600, (30 * power(2, attempts - 1))::integer))
            else available_at end,
        claimed_by = null,
        claim_expires_at = null,
        last_error = left(coalesce(nullif(p_error, ''), 'notification delivery failed'), 2000),
        updated_at = now()
    where id = p_delivery_id and status = 'processing' and claimed_by = p_run_key
    returning * into v_delivery;
    if not found then
        raise exception 'conflict: notification delivery claim is not owned by this worker';
    end if;
    return to_jsonb(v_delivery);
end;
$$;
