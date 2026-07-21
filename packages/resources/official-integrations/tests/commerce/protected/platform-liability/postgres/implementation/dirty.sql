select commerce_liability_test.seed_order('dirty-trigger', 10000);
select commerce_liability_test.seed_order('dirty-due', 20000);

create temporary table liability_dirty_baseline as
select control.liability_revision,
    control.required_minimum_amount,
    (select terms.platform_risk_reserve_contribution_amount
     from commerce.order_financial_terms terms
     join commerce_liability_test.orders seeded on seeded.order_id = terms.order_id
     where seeded.label = 'dirty-due') as due_risk_amount,
    (select to_jsonb(contribution)
     from commerce.platform_payout_order_contributions contribution
     join commerce_liability_test.orders seeded
        on seeded.order_id = contribution.order_id
     where seeded.label = 'dirty-due') as due_cache
from commerce.platform_payout_liability_controls control
where control.control_key = 'default';

update commerce.platform_payout_order_liabilities liability
set lifecycle_status = 'active', risk_release_at = now()
from commerce_liability_test.orders seeded
where seeded.label = 'dirty-due'
  and liability.order_id = seeded.order_id;

do $dirty_is_deferred$
declare
    v_baseline liability_dirty_baseline%rowtype;
begin
    select * into v_baseline from liability_dirty_baseline;
    if (select (liability_revision, required_minimum_amount)
        from commerce.platform_payout_liability_controls
        where control_key = 'default') is distinct from row(
            v_baseline.liability_revision, v_baseline.required_minimum_amount
        )
       or (select to_jsonb(contribution)
           from commerce.platform_payout_order_contributions contribution
           join commerce_liability_test.orders seeded
              on seeded.order_id = contribution.order_id
           where seeded.label = 'dirty-due') is distinct from v_baseline.due_cache
       or not exists (
           select 1 from commerce.platform_payout_liability_pending_orders pending
           where pending.source_table = 'platform_payout_order_liabilities'
       ) then
        raise exception 'platform liability: direct dirty write changed control or cache';
    end if;
end;
$dirty_is_deferred$;

update commerce.platform_payout_liability_controls
set calculated_at = '-infinity'::timestamptz
where control_key = 'default';

update commerce.order_settlements
set status = status
where false;

update commerce.order_settlements settlement
set manual_review_reason = manual_review_reason
from commerce_liability_test.orders seeded
where seeded.label = 'dirty-trigger'
  and settlement.order_id = seeded.order_id;

do $unrelated_does_not_flush$
begin
    if not exists (select 1 from commerce.platform_payout_liability_pending_orders)
       or (select calculated_at from commerce.platform_payout_liability_controls
           where control_key = 'default') <> '-infinity'::timestamptz then
        raise exception 'platform liability: empty or unrelated statement flushed dirty work';
    end if;
end;
$unrelated_does_not_flush$;

update commerce.order_settlements settlement
set total_transferred_amount = 10
from commerce_liability_test.orders seeded
where seeded.label = 'dirty-trigger'
  and settlement.order_id = seeded.order_id;

select commerce_liability_test.assert_cache_parity();

do $dirty_sweep$
declare
    v_baseline liability_dirty_baseline%rowtype;
    v_control commerce.platform_payout_liability_controls%rowtype;
begin
    select * into v_baseline from liability_dirty_baseline;
    select * into v_control
    from commerce.platform_payout_liability_controls where control_key = 'default';
    if v_control.liability_revision <> v_baseline.liability_revision + 1
       or v_control.required_minimum_amount
            <> v_baseline.required_minimum_amount - 10 - v_baseline.due_risk_amount
       or v_control.calculated_at = '-infinity'::timestamptz
       or exists (select 1 from commerce.platform_payout_liability_pending_orders)
       or (select count(*) from commerce.platform_payout_liability_revisions
           where liability_revision > v_baseline.liability_revision) <> 1 then
        raise exception 'platform liability: dirty sweep changed: %', to_jsonb(v_control);
    end if;
end;
$dirty_sweep$;
