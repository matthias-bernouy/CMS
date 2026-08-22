

create or replace view commerce.platform_payout_order_contribution_projection
with (security_invoker = true)
as
select liability.order_id,
    case when settlement.order_id is not null and terms.order_id is not null
            and liability.lifecycle_status in ('provisional', 'active') then
        greatest(0, settlement.authorized_seller_amount
            - settlement.total_transferred_amount
            + settlement.total_reversed_amount)
    else 0 end as seller_liability_amount,
    case when settlement.order_id is not null and terms.order_id is not null and (
        liability.lifecycle_status = 'provisional'
        or (liability.lifecycle_status = 'active' and (
            liability.risk_release_at > now()
            or exists (
                select 1 from commerce.stripe_dispute_projections dispute
                where dispute.order_id = liability.order_id
                  and (dispute.status not in ('won', 'prevented', 'warning_closed')
                    or dispute.funds_withdrawn)
            )
        ))
    ) then terms.platform_risk_reserve_contribution_amount
    else 0 end as risk_reserve_liability_amount,
    case when settlement.order_id is not null and terms.order_id is not null
            and liability.lifecycle_status = 'active'
            and liability.risk_release_at > now()
            and terms.platform_risk_reserve_contribution_amount > 0
        then liability.risk_release_at end as next_reconciliation_at
from commerce.platform_payout_order_liabilities liability
left join commerce.order_settlements settlement
    on settlement.order_id = liability.order_id
left join commerce.order_financial_terms terms
    on terms.order_id = liability.order_id;

create or replace function commerce.platform_payout_order_contribution_rows(
    p_order_ids bigint[]
)
returns table (
    order_id bigint,
    seller_liability_amount bigint,
    risk_reserve_liability_amount bigint,
    next_reconciliation_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
    select projection.order_id,
        projection.seller_liability_amount,
        projection.risk_reserve_liability_amount,
        projection.next_reconciliation_at
    from commerce.platform_payout_order_contribution_projection projection
    where projection.order_id = any(p_order_ids)
$$;