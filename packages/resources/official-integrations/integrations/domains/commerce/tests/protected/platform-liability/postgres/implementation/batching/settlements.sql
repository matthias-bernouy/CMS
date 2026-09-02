select commerce_liability_test.seed_order('batch-settlement-a', 10000);
select commerce_liability_test.seed_order('batch-settlement-b', 20000);

create temporary table settlement_batch_baseline as
select control.liability_revision,
    control.required_minimum_amount,
    coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
        where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
            ::regprocedure), 0) as delta_calls
from commerce.platform_payout_liability_controls control
where control.control_key = 'default';

create temporary table settlement_cache_rows as
select contribution.order_id, contribution.ctid as cached_tid
from commerce.platform_payout_order_contributions contribution
join commerce_liability_test.orders seeded on seeded.order_id = contribution.order_id
where seeded.label in ('batch-settlement-a', 'batch-settlement-b');

update commerce.platform_payout_liability_controls
set calculated_at = '-infinity'::timestamptz
where control_key = 'default';

update commerce.order_settlements set status = status where false;

update commerce.order_settlements settlement
set manual_review_reason = manual_review_reason
from commerce_liability_test.orders seeded
where seeded.label in ('batch-settlement-a', 'batch-settlement-b')
  and settlement.order_id = seeded.order_id;

do $settlement_guard_budget$
declare
    v_baseline settlement_batch_baseline%rowtype;
begin
    select * into v_baseline from settlement_batch_baseline;
    if coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
            where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
                ::regprocedure), 0) <> v_baseline.delta_calls
       or (select calculated_at from commerce.platform_payout_liability_controls
           where control_key = 'default') <> '-infinity'::timestamptz then
        raise exception 'platform liability: empty or unrelated settlement called delta';
    end if;
end;
$settlement_guard_budget$;

update commerce.order_settlements settlement
set status = status
from commerce_liability_test.orders seeded
where seeded.label in ('batch-settlement-a', 'batch-settlement-b')
  and settlement.order_id = seeded.order_id;

do $settlement_noop_budget$
declare
    v_baseline settlement_batch_baseline%rowtype;
begin
    select * into v_baseline from settlement_batch_baseline;
    if coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
            where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
                ::regprocedure), 0) <> v_baseline.delta_calls + 1
       or (select liability_revision from commerce.platform_payout_liability_controls
           where control_key = 'default') <> v_baseline.liability_revision
       or (select calculated_at from commerce.platform_payout_liability_controls
           where control_key = 'default') = '-infinity'::timestamptz
       or exists (
           select 1 from settlement_cache_rows baseline
           join commerce.platform_payout_order_contributions current
                on current.order_id = baseline.order_id
           where current.ctid is distinct from baseline.cached_tid
       )
       or exists (select 1 from commerce.platform_payout_liability_pending_orders) then
        raise exception 'platform liability: no-op settlement batching changed';
    end if;
end;
$settlement_noop_budget$;

update commerce.order_settlements settlement
set total_transferred_amount = case seeded.label
        when 'batch-settlement-a' then 11
        when 'batch-settlement-b' then 17
    end
from commerce_liability_test.orders seeded
where seeded.label in ('batch-settlement-a', 'batch-settlement-b')
  and settlement.order_id = seeded.order_id;

select commerce_liability_test.assert_cache_parity();

do $settlement_change_budget$
declare
    v_baseline settlement_batch_baseline%rowtype;
begin
    select * into v_baseline from settlement_batch_baseline;
    if coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
            where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
                ::regprocedure), 0) <> v_baseline.delta_calls + 2
       or (select liability_revision from commerce.platform_payout_liability_controls
           where control_key = 'default') <> v_baseline.liability_revision + 1
       or (select required_minimum_amount
           from commerce.platform_payout_liability_controls where control_key = 'default')
            <> v_baseline.required_minimum_amount - 28
       or exists (select 1 from commerce.platform_payout_liability_pending_orders) then
        raise exception 'platform liability: changed settlement batching exceeded budget';
    end if;
end;
$settlement_change_budget$;
