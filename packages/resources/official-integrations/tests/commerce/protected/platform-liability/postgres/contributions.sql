select commerce_liability_test.seed_order('contribution-provisional', 10000);
select commerce_liability_test.seed_order('contribution-fresh', 20000);
select commerce_liability_test.seed_order('contribution-expired', 30000);
select commerce_liability_test.seed_order('contribution-disputed', 40000);
select commerce_liability_test.seed_order('contribution-released', 50000);

update commerce.order_settlements settlement
set total_transferred_amount = 100,
    total_reversed_amount = 25
from commerce_liability_test.orders seeded
where seeded.label = 'contribution-fresh'
  and settlement.order_id = seeded.order_id;

update commerce.platform_payout_order_liabilities liability
set lifecycle_status = case seeded.label
        when 'contribution-provisional' then 'provisional'
        when 'contribution-released' then 'released'
        else 'active'
    end,
    risk_release_at = case seeded.label
        when 'contribution-fresh' then now() + interval '1 day'
        when 'contribution-expired' then now() - interval '1 day'
        when 'contribution-disputed' then now() - interval '1 day'
        else null
    end
from commerce_liability_test.orders seeded
where liability.order_id = seeded.order_id;

insert into commerce.stripe_dispute_projections (
    order_id, provider_dispute_id, status, reason, amount, currency,
    funds_withdrawn, provider_snapshot, opened_at, closed_at
)
select seeded.order_id, 'dp-liability-contribution', 'won', 'fraudulent',
    (seeded.terms->>'buyer_total_amount')::bigint, 'eur', true,
    '{"fundsWithdrawn":true}'::jsonb, now() - interval '2 days', now()
from commerce_liability_test.orders seeded
where seeded.label = 'contribution-disputed';

do $contribution_matrix$
declare
    v_control jsonb;
    v_expected bigint;
begin
    select sum(case seeded.label
        when 'contribution-provisional' then
            settlement.authorized_seller_amount
                + terms.platform_risk_reserve_contribution_amount
        when 'contribution-fresh' then
            settlement.authorized_seller_amount
                - settlement.total_transferred_amount
                + settlement.total_reversed_amount
                + terms.platform_risk_reserve_contribution_amount
        when 'contribution-expired' then settlement.authorized_seller_amount
        when 'contribution-disputed' then
            settlement.authorized_seller_amount
                + terms.platform_risk_reserve_contribution_amount
        when 'contribution-released' then 0
    end)
    into v_expected
    from commerce_liability_test.orders seeded
    join commerce.order_settlements settlement on settlement.order_id = seeded.order_id
    join commerce.order_financial_terms terms on terms.order_id = seeded.order_id;

    v_control := commerce.refresh_platform_payout_liability(
        'Contribution matrix contract', null
    );
    if (v_control->>'requiredMinimumAmount')::bigint <> v_expected
       or (select required_minimum_amount
           from commerce.platform_payout_liability_controls
           where control_key = 'default') <> v_expected then
        raise exception 'platform liability: contribution matrix changed: %, expected %',
            v_control, v_expected;
    end if;
end;
$contribution_matrix$;
