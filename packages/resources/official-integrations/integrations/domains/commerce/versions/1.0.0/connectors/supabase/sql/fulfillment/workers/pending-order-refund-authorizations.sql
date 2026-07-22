

create or replace function commerce.pending_order_refund_authorizations(
    p_run_key text,
    p_limit integer default 25
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_authorizations jsonb;
begin
    if p_run_key is null or length(btrim(p_run_key)) = 0 then
        raise exception 'validation: refund run key is required';
    end if;
    insert into commerce.financial_operation_dispatch_claims (
        operation_kind, operation_id, order_id
    )
    select 'refund', request.id::text, request.order_id
    from commerce.refund_requests request
    where request.status in ('approved', 'provider_operation_reserved', 'processing')
    on conflict (operation_kind, operation_id) do nothing;
    with candidates as (
        select dispatch.operation_kind, dispatch.operation_id
        from commerce.financial_operation_dispatch_claims dispatch
        join commerce.refund_requests request on request.id::text = dispatch.operation_id
        join commerce.order_settlements settlement on settlement.order_id = request.order_id
        where dispatch.operation_kind = 'refund'
          and request.status in ('approved', 'provider_operation_reserved', 'processing')
          and settlement.status in (
            'refund_pending', 'held', 'released', 'reversal_pending', 'reversed', 'manual_review'
          )
          and dispatch.available_at <= now()
          and (dispatch.claimed_at is null
            or dispatch.claimed_at < now() - interval '5 minutes')
        order by dispatch.available_at, dispatch.created_at, dispatch.operation_id
        limit least(greatest(p_limit, 1), 100)
        for update of dispatch skip locked
    ), claimed as (
        update commerce.financial_operation_dispatch_claims dispatch set
            claimed_at = now(),
            claimed_by = 'refund-worker:' || p_run_key,
            attempts = attempts + 1
        from candidates
        where dispatch.operation_kind = candidates.operation_kind
          and dispatch.operation_id = candidates.operation_id
        returning dispatch.operation_id
    )
    select coalesce(jsonb_agg(
        commerce.refund_authorization_payload(request.id)
        order by request.created_at, request.id
    ), '[]'::jsonb) into v_authorizations
    from claimed dispatch
    join commerce.refund_requests request on request.id::text = dispatch.operation_id;
    return jsonb_build_object('runKey', p_run_key, 'authorizations', v_authorizations);
end;
$$;