

create or replace function commerce.record_delivery_order_reconciliation_health(
    p_run_key text,
    p_checked_at timestamptz,
    p_order_public_id uuid,
    p_shipment_id text,
    p_provider_reference text,
    p_shipment_status text,
    p_pending_projection_count integer,
    p_manual_review_count integer,
    p_tracking_error_count integer,
    p_tracking_checked_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order_id bigint;
    v_health commerce.delivery_order_reconciliation_health%rowtype;
begin
    if p_run_key is null or length(btrim(p_run_key)) = 0
        or p_checked_at is null or p_checked_at > now() + interval '5 minutes'
        or p_shipment_id is null or length(btrim(p_shipment_id)) = 0
        or p_shipment_status is null or length(btrim(p_shipment_status)) = 0
        or p_pending_projection_count is null or p_pending_projection_count < 0
        or p_manual_review_count is null or p_manual_review_count < 0
        or p_tracking_error_count is null or p_tracking_error_count < 0 then
        raise exception 'validation: invalid order Delivery reconciliation health';
    end if;
    select id into v_order_id from commerce.orders where public_id = p_order_public_id;
    if v_order_id is null then
        return jsonb_build_object(
            'ignored', true, 'reason', 'order_not_found',
            'orderPublicId', p_order_public_id, 'checkedAt', p_checked_at
        );
    end if;
    insert into commerce.delivery_order_reconciliation_health (
        order_id, run_key, checked_at, shipment_id, provider_reference,
        shipment_status, pending_projection_count, manual_review_count,
        tracking_error_count, tracking_checked_at, updated_at
    ) values (
        v_order_id, btrim(p_run_key), p_checked_at, btrim(p_shipment_id),
        nullif(btrim(p_provider_reference), ''), btrim(p_shipment_status),
        p_pending_projection_count, p_manual_review_count,
        p_tracking_error_count, p_tracking_checked_at, now()
    ) on conflict (order_id) do update set
        run_key = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.run_key else commerce.delivery_order_reconciliation_health.run_key end,
        checked_at = greatest(commerce.delivery_order_reconciliation_health.checked_at, excluded.checked_at),
        shipment_id = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.shipment_id else commerce.delivery_order_reconciliation_health.shipment_id end,
        provider_reference = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.provider_reference else commerce.delivery_order_reconciliation_health.provider_reference end,
        shipment_status = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.shipment_status else commerce.delivery_order_reconciliation_health.shipment_status end,
        pending_projection_count = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.pending_projection_count else commerce.delivery_order_reconciliation_health.pending_projection_count end,
        manual_review_count = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.manual_review_count else commerce.delivery_order_reconciliation_health.manual_review_count end,
        tracking_error_count = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.tracking_error_count else commerce.delivery_order_reconciliation_health.tracking_error_count end,
        tracking_checked_at = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then excluded.tracking_checked_at else commerce.delivery_order_reconciliation_health.tracking_checked_at end,
        updated_at = case when excluded.checked_at >= commerce.delivery_order_reconciliation_health.checked_at
            then now() else commerce.delivery_order_reconciliation_health.updated_at end
    returning * into v_health;
    return to_jsonb(v_health);
end;
$$;