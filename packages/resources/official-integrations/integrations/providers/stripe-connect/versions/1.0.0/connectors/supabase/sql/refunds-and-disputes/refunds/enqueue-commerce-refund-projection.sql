

create or replace function stripe_connect.enqueue_commerce_refund_projection(
    p_refund_id bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_refund stripe_connect.refunds%rowtype;
    v_projection stripe_connect.commerce_projection_outbox%rowtype;
    v_projection_key text;
    v_recovery_key text;
    v_sequence integer;
    v_payload jsonb;
begin
    select * into v_refund
    from stripe_connect.refunds
    where id = p_refund_id
    for share;
    if not found then raise exception 'not_found: refund'; end if;
    if v_refund.status not in ('pending', 'succeeded', 'failed', 'cancelled') then
        raise exception 'conflict: refund provider state is not projectable';
    end if;
    v_projection_key := 'refund:' || v_refund.id || ':' || v_refund.status;
    v_recovery_key := case when v_refund.required_reversal_amount > 0
        then v_refund.refund_request_id || ':seller-recovery' else null end;
    v_sequence := case when v_refund.status = 'pending' then 10 else 20 end;
    v_payload := jsonb_build_object(
        'refundId', v_refund.id,
        'refundRequestId', v_refund.refund_request_id,
        'commerceRefundRequestId', v_refund.commerce_refund_request_id,
        'stripeRefundId', v_refund.stripe_refund_id,
        'status', v_refund.status,
        'failureReason', v_refund.failure_reason,
        'providerSnapshot', coalesce(v_refund.provider_snapshot, '{}'::jsonb),
        'occurredAt', v_refund.updated_at
    );
    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind,
        provider_object_id, projection_payload, recovery_key, causal_sequence
    ) values (
        v_refund.operation_id, v_refund.payment_id, v_projection_key, 'refund',
        coalesce(v_refund.stripe_refund_id, v_refund.id::text), v_payload,
        v_recovery_key, v_sequence
    ) on conflict (projection_key) do nothing;
    select * into v_projection
    from stripe_connect.commerce_projection_outbox
    where projection_key = v_projection_key;
    if v_projection.operation_id is distinct from v_refund.operation_id
        or v_projection.payment_id is distinct from v_refund.payment_id then
        raise exception 'conflict: refund projection replay changed immutable provider state';
    end if;
    return to_jsonb(v_projection);
end;
$$;