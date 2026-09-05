

create or replace function commerce.record_delivery_reconciliation_health(
    p_run_key text,
    p_checked_at timestamptz,
    p_pending_projection_count integer,
    p_manual_review_count integer,
    p_tracking_error_count integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_health commerce.delivery_reconciliation_health%rowtype;
begin
    if p_run_key is null or length(btrim(p_run_key)) = 0 or p_checked_at is null
        or p_checked_at > now() + interval '5 minutes'
        or p_pending_projection_count is null or p_pending_projection_count < 0
        or p_manual_review_count is null or p_manual_review_count < 0
        or p_tracking_error_count is null or p_tracking_error_count < 0 then
        raise exception 'validation: invalid delivery reconciliation health';
    end if;
    insert into commerce.delivery_reconciliation_health (
        id, run_key, checked_at, pending_projection_count, manual_review_count,
        tracking_error_count, updated_at
    ) values (
        'mondial-relay', p_run_key, p_checked_at, p_pending_projection_count,
        p_manual_review_count, p_tracking_error_count, now()
    ) on conflict (id) do update set
        run_key = case
            when excluded.checked_at >= commerce.delivery_reconciliation_health.checked_at
                then excluded.run_key
            else commerce.delivery_reconciliation_health.run_key end,
        checked_at = greatest(commerce.delivery_reconciliation_health.checked_at, excluded.checked_at),
        pending_projection_count = case
            when excluded.checked_at >= commerce.delivery_reconciliation_health.checked_at
                then excluded.pending_projection_count
            else commerce.delivery_reconciliation_health.pending_projection_count end,
        manual_review_count = case
            when excluded.checked_at >= commerce.delivery_reconciliation_health.checked_at
                then excluded.manual_review_count
            else commerce.delivery_reconciliation_health.manual_review_count end,
        tracking_error_count = case
            when excluded.checked_at >= commerce.delivery_reconciliation_health.checked_at
                then excluded.tracking_error_count
            else commerce.delivery_reconciliation_health.tracking_error_count end,
        updated_at = now()
    returning * into v_health;
    return to_jsonb(v_health);
end;
$$;