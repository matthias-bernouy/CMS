

create or replace function commerce.pending_payment_cancellation_authorizations(
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
        raise exception 'validation: payment cancellation run key is required';
    end if;
    insert into commerce.financial_operation_dispatch_claims (operation_kind, operation_id, order_id)
    select 'payment_cancellation', request.id::text, request.order_id
    from commerce.payment_cancellation_requests request
    where request.status in ('requested', 'processing')
    on conflict (operation_kind, operation_id) do nothing;
    with candidates as (
        select dispatch.operation_kind, dispatch.operation_id
        from commerce.financial_operation_dispatch_claims dispatch
        join commerce.payment_cancellation_requests request on request.id::text = dispatch.operation_id
        where dispatch.operation_kind = 'payment_cancellation'
          and request.status in ('requested', 'processing')
          and dispatch.available_at <= now()
          and (dispatch.claimed_at is null or dispatch.claimed_at < now() - interval '5 minutes')
        order by dispatch.available_at, dispatch.created_at, dispatch.operation_id
        limit least(greatest(p_limit, 1), 100)
        for update of dispatch skip locked
    ), claimed as (
        update commerce.financial_operation_dispatch_claims dispatch set
            claimed_at = now(), claimed_by = 'payment-cancellation-worker:' || p_run_key,
            attempts = attempts + 1
        from candidates
        where dispatch.operation_kind = candidates.operation_kind
          and dispatch.operation_id = candidates.operation_id
        returning dispatch.operation_id
    ), marked as (
        update commerce.payment_cancellation_requests request set status = 'processing'
        from claimed where request.id::text = claimed.operation_id
        returning request.id
    )
    select coalesce(jsonb_agg(
        commerce.payment_cancellation_authorization_payload(marked.id)
        order by marked.id
    ), '[]'::jsonb) into v_authorizations from marked;
    return jsonb_build_object('runKey', p_run_key, 'authorizations', v_authorizations);
end;
$$;