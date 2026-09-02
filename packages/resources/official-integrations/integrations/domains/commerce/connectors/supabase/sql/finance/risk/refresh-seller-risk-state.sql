

create or replace function commerce.refresh_seller_risk_state(p_seller_id bigint)
returns commerce.seller_risk_states
language plpgsql
set search_path = ''
as $$
declare
    v_reserve bigint;
    v_at_risk bigint;
    v_debt bigint;
    v_state commerce.seller_risk_states%rowtype;
begin
    select coalesce(sum(settlement.seller_reserve_liability_remaining_amount), 0)
    into v_reserve
    from commerce.order_settlements settlement
    join commerce.orders order_row on order_row.id = settlement.order_id
    where order_row.seller_id = p_seller_id
      and settlement.seller_reserve_liability_remaining_amount > 0
      and settlement.status not in ('refunded', 'reversed');

    select
        coalesce(sum(amount - recovered_amount) filter (where status = 'at_risk'), 0),
        coalesce(sum(amount - recovered_amount) filter (where status = 'debt'), 0)
    into v_at_risk, v_debt
    from commerce.seller_financial_exposures
    where seller_id = p_seller_id;

    insert into commerce.seller_risk_states (
        seller_id, status, reserve_liability_amount, at_risk_exposure_amount,
        outstanding_debt_amount, hold_reason, updated_at
    ) values (
        p_seller_id,
        case when v_debt > 0 then 'blocked'
            when v_at_risk > 0 then 'restricted'
            when v_reserve > 0 then 'monitored'
            else 'standard' end,
        v_reserve, v_at_risk, v_debt,
        case when v_debt > 0 then 'Unrecovered seller debt'
            when v_at_risk > 0 then 'Open seller financial exposure'
            else null end,
        now()
    ) on conflict (seller_id) do update set
        status = excluded.status,
        reserve_liability_amount = excluded.reserve_liability_amount,
        at_risk_exposure_amount = excluded.at_risk_exposure_amount,
        outstanding_debt_amount = excluded.outstanding_debt_amount,
        hold_reason = excluded.hold_reason,
        updated_at = excluded.updated_at
    returning * into v_state;
    return v_state;
end;
$$;