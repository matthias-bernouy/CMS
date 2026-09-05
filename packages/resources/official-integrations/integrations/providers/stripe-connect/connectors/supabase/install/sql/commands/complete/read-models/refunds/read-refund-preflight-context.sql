

create or replace function stripe_connect.read_refund_preflight_context(
    p_payment_id bigint,
    p_refund_request_id text
)
returns table (
    existing_refund jsonb,
    has_nonterminal boolean,
    committed_reduction_amount numeric
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_existing_refund jsonb;
    v_has_nonterminal boolean;
    v_committed_reduction_amount numeric;
begin
    -- Keep the request-id lookup before the payment aggregate: callers rely on
    -- a refund committed between these statements being observed below.
    select pg_catalog.to_jsonb(refund_row)
    into v_existing_refund
    from stripe_connect.refunds refund_row
    where refund_row.refund_request_id = p_refund_request_id;

    if v_existing_refund is not null then
        return query select v_existing_refund, false, 0::numeric;
        return;
    end if;

    select
        coalesce(pg_catalog.bool_or(refund_row.status in (
            'reserved', 'processing', 'pending', 'manual_review'
        )), false),
        coalesce(pg_catalog.sum(refund_row.seller_entitlement_reduction_amount)
            filter (where refund_row.status = 'succeeded'), 0)
    into v_has_nonterminal, v_committed_reduction_amount
    from stripe_connect.refunds refund_row
    where refund_row.payment_id = p_payment_id;

    return query select
        null::jsonb,
        v_has_nonterminal,
        v_committed_reduction_amount;
end;
$$;

revoke execute on function stripe_connect.read_refund_preflight_context(bigint, text)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_refund_preflight_context(bigint, text)
    to service_role;
