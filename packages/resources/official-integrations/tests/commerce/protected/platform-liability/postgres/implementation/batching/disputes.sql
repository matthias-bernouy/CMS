select commerce_liability_test.seed_order('batch-dispute', 10000);

update commerce.platform_payout_order_liabilities liability
set lifecycle_status = 'active', risk_release_at = now() - interval '1 day'
from commerce_liability_test.orders seeded
where seeded.label = 'batch-dispute'
  and liability.order_id = seeded.order_id;

insert into commerce.stripe_dispute_projections (
    order_id, provider_dispute_id, status, reason, amount, currency,
    funds_withdrawn, provider_snapshot, opened_at, closed_at
)
select seeded.order_id, 'dp-liability-batch', 'won', 'fraudulent',
    terms.buyer_total_amount, 'eur', false, '{"batch":true}'::jsonb,
    now() - interval '2 days', now()
from commerce_liability_test.orders seeded
join commerce.order_financial_terms terms on terms.order_id = seeded.order_id
where seeded.label = 'batch-dispute';

select commerce_liability_test.assert_cache_parity();

create temporary table dispute_batch_baseline as
select control.liability_revision,
    control.required_minimum_amount,
    terms.platform_risk_reserve_contribution_amount as risk_amount,
    coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
        where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
            ::regprocedure), 0) as delta_calls
from commerce.platform_payout_liability_controls control
join commerce_liability_test.orders seeded on seeded.label = 'batch-dispute'
join commerce.order_financial_terms terms on terms.order_id = seeded.order_id
where control.control_key = 'default';

insert into commerce.stripe_dispute_projections (
    order_id, provider_dispute_id, status, reason, amount, currency,
    funds_withdrawn, provider_snapshot, opened_at, closed_at
)
select seeded.order_id, 'dp-liability-batch', 'won', 'fraudulent',
    terms.buyer_total_amount, 'eur', true, '{"batch":true}'::jsonb,
    now() - interval '2 days', now()
from commerce_liability_test.orders seeded
join commerce.order_financial_terms terms on terms.order_id = seeded.order_id
where seeded.label = 'batch-dispute'
on conflict (provider_dispute_id) do update set
    status = excluded.status,
    funds_withdrawn = excluded.funds_withdrawn;

select commerce_liability_test.assert_cache_parity();

do $dispute_upsert_budget$
declare
    v_baseline dispute_batch_baseline%rowtype;
begin
    select * into v_baseline from dispute_batch_baseline;
    if coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
            where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
                ::regprocedure), 0) <> v_baseline.delta_calls + 1
       or (select liability_revision from commerce.platform_payout_liability_controls
           where control_key = 'default') <> v_baseline.liability_revision + 1
       or (select required_minimum_amount
           from commerce.platform_payout_liability_controls where control_key = 'default')
            <> v_baseline.required_minimum_amount + v_baseline.risk_amount
       or exists (select 1 from commerce.platform_payout_liability_pending_orders) then
        raise exception 'platform liability: dispute upsert exceeded delta budget';
    end if;
end;
$dispute_upsert_budget$;
