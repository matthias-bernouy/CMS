

create or replace function commerce.refresh_platform_payout_liability(
    p_calculation_reason text,
    p_included_prospective_order_id bigint default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_pending_event_ids bigint[];
    v_required_amount bigint;
    v_result jsonb;
    v_updated_count bigint;
begin
    if p_calculation_reason is null or length(btrim(p_calculation_reason)) = 0 then
        raise exception 'validation: platform payout liability calculation reason is required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('commerce:platform-payout-liability', 0)
    );
    select coalesce(array_agg(pending.event_id order by pending.event_id), '{}'::bigint[])
    into v_pending_event_ids
    from commerce.platform_payout_liability_pending_orders pending;
    merge into commerce.platform_payout_order_contributions current
    using commerce.platform_payout_order_contribution_projection calculated
        on current.order_id = calculated.order_id
    when matched and (
        current.seller_liability_amount,
        current.risk_reserve_liability_amount,
        current.next_reconciliation_at
    ) is distinct from (
        calculated.seller_liability_amount,
        calculated.risk_reserve_liability_amount,
        calculated.next_reconciliation_at
    ) then update set
        seller_liability_amount = calculated.seller_liability_amount,
        risk_reserve_liability_amount = calculated.risk_reserve_liability_amount,
        next_reconciliation_at = calculated.next_reconciliation_at
    when not matched then insert (
        order_id, seller_liability_amount,
        risk_reserve_liability_amount, next_reconciliation_at
    ) values (
        calculated.order_id, calculated.seller_liability_amount,
        calculated.risk_reserve_liability_amount,
        calculated.next_reconciliation_at
    );
    get diagnostics v_updated_count = row_count;
    select coalesce(sum(contribution.seller_liability_amount
            + contribution.risk_reserve_liability_amount), 0)::bigint
    into v_required_amount
    from commerce.platform_payout_order_contributions contribution;
    update commerce.platform_payout_liability_cache_state set
        calculation_version = 1,
        initialized = true,
        initialized_at = coalesce(initialized_at, now())
    where control_key = 'default';
    if not found then
        raise exception 'configuration: platform payout liability cache state is unavailable';
    end if;
    v_result := commerce.apply_platform_payout_liability_total(
        v_required_amount, p_calculation_reason, p_included_prospective_order_id
    );
    delete from commerce.platform_payout_liability_pending_orders
    where event_id = any(v_pending_event_ids);
    return v_result;
end;
$$;