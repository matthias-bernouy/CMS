

create or replace function commerce.refresh_platform_payout_liability_delta(
    p_order_ids bigint[],
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
    v_cache_initialized boolean;
    v_cache_version integer;
    v_candidate_ids bigint[];
    v_current_amount bigint;
    v_delta bigint;
    v_pending_event_ids bigint[];
    v_pending_order_ids bigint[];
    v_requires_full_reconciliation boolean;
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
    select coalesce(array_agg(pending.event_id order by pending.event_id), '{}'::bigint[]),
        coalesce(array_agg(distinct pending.order_id order by pending.order_id)
            filter (where pending.order_id is not null), '{}'::bigint[]),
        coalesce(bool_or(pending.requires_full_reconciliation), false)
    into v_pending_event_ids, v_pending_order_ids, v_requires_full_reconciliation
    from commerce.platform_payout_liability_pending_orders pending;
    select state.initialized, state.calculation_version
    into v_cache_initialized, v_cache_version
    from commerce.platform_payout_liability_cache_state state
    where state.control_key = 'default';
    if not found then
        raise exception 'configuration: platform payout liability cache state is unavailable';
    end if;
    if not v_cache_initialized or v_cache_version <> 1
        or v_requires_full_reconciliation then
        return commerce.refresh_platform_payout_liability(
            p_calculation_reason, p_included_prospective_order_id
        );
    end if;
    select coalesce(array_agg(candidate.order_id order by candidate.order_id), '{}'::bigint[])
    into v_candidate_ids
    from (
        select explicit.order_id
        from unnest(coalesce(p_order_ids, '{}'::bigint[])) explicit(order_id)
        where explicit.order_id is not null
        union
        select pending.order_id
        from unnest(v_pending_order_ids) pending(order_id)
        union
        select contribution.order_id
        from commerce.platform_payout_order_contributions contribution
        where contribution.next_reconciliation_at <= now()
    ) candidate;
    with existing as materialized (
        select contribution.*
        from commerce.platform_payout_order_contributions contribution
        where contribution.order_id = any(v_candidate_ids)
    ), calculated as materialized (
        select * from commerce.platform_payout_order_contribution_rows(
            v_candidate_ids
        )
    ), deltas as materialized (
        select calculated.*,
            coalesce(existing.seller_liability_amount, 0) as previous_seller_amount,
            coalesce(existing.risk_reserve_liability_amount, 0) as previous_risk_amount,
            existing.next_reconciliation_at as previous_reconciliation_at
        from calculated
        left join existing on existing.order_id = calculated.order_id
    ), changed as materialized (
        select deltas.*
        from deltas
        where (deltas.seller_liability_amount,
            deltas.risk_reserve_liability_amount,
            deltas.next_reconciliation_at) is distinct from (
                deltas.previous_seller_amount,
                deltas.previous_risk_amount,
                deltas.previous_reconciliation_at
            )
    ), upserted as (
        insert into commerce.platform_payout_order_contributions (
            order_id, seller_liability_amount,
            risk_reserve_liability_amount, next_reconciliation_at
        )
        select order_id, seller_liability_amount,
            risk_reserve_liability_amount, next_reconciliation_at
        from changed
        on conflict (order_id) do update set
            seller_liability_amount = excluded.seller_liability_amount,
            risk_reserve_liability_amount = excluded.risk_reserve_liability_amount,
            next_reconciliation_at = excluded.next_reconciliation_at
        returning 1
    )
    select coalesce(sum(deltas.seller_liability_amount
            + deltas.risk_reserve_liability_amount
            - deltas.previous_seller_amount - deltas.previous_risk_amount), 0)::bigint,
        (select count(*) from upserted)
    into v_delta, v_updated_count
    from deltas;
    select required_minimum_amount into v_current_amount
    from commerce.platform_payout_liability_controls
    where control_key = 'default';
    if not found then
        raise exception 'configuration: platform payout liability control is unavailable';
    end if;
    v_required_amount := v_current_amount + v_delta;
    v_result := commerce.apply_platform_payout_liability_total(
        v_required_amount, p_calculation_reason, p_included_prospective_order_id
    );
    delete from commerce.platform_payout_liability_pending_orders
    where event_id = any(v_pending_event_ids);
    return v_result;
end;
$$;