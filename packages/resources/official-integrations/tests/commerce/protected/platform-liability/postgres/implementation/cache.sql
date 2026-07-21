select commerce_liability_test.seed_order('cache-repair-a', 10000);
select commerce_liability_test.seed_order('cache-repair-b', 20000);
select commerce_liability_test.assert_cache_parity();

create temporary table liability_cache_baseline as
select control.liability_revision,
    control.required_minimum_amount,
    (select count(*) from commerce.platform_payout_liability_revisions) as revision_count
from commerce.platform_payout_liability_controls control
where control.control_key = 'default';

reset role;

delete from commerce.platform_payout_order_contributions contribution
using commerce_liability_test.orders seeded
where seeded.label = 'cache-repair-a'
  and contribution.order_id = seeded.order_id;

update commerce.platform_payout_order_contributions contribution
set seller_liability_amount = 0,
    risk_reserve_liability_amount = 0,
    next_reconciliation_at = null
from commerce_liability_test.orders seeded
where seeded.label = 'cache-repair-b'
  and contribution.order_id = seeded.order_id;

set local role service_role;

select commerce.refresh_platform_payout_liability(
    'Cache repair implementation contract', null
);
select commerce_liability_test.assert_cache_parity();

do $cache_repair$
declare
    v_baseline liability_cache_baseline%rowtype;
    v_control commerce.platform_payout_liability_controls%rowtype;
begin
    select * into v_baseline from liability_cache_baseline;
    select * into v_control
    from commerce.platform_payout_liability_controls
    where control_key = 'default';
    if v_control.liability_revision <> v_baseline.liability_revision
       or v_control.required_minimum_amount <> v_baseline.required_minimum_amount
       or (select count(*) from commerce.platform_payout_liability_revisions)
            <> v_baseline.revision_count
       or exists (select 1 from commerce.platform_payout_liability_pending_orders) then
        raise exception 'platform liability: full cache repair changed financial state: %',
            to_jsonb(v_control);
    end if;
end;
$cache_repair$;

update commerce.platform_payout_order_contributions contribution
set seller_liability_amount = 0
from commerce_liability_test.orders seeded
where seeded.label = 'cache-repair-a'
  and contribution.order_id = seeded.order_id;

update commerce.platform_payout_liability_cache_state
set calculation_version = 2
where control_key = 'default';

update commerce.order_settlements settlement
set status = status
from commerce_liability_test.orders seeded
where seeded.label = 'cache-repair-a'
  and settlement.order_id = seeded.order_id;

select commerce_liability_test.assert_cache_parity();

do $cache_version_fallback$
declare
    v_baseline liability_cache_baseline%rowtype;
begin
    select * into v_baseline from liability_cache_baseline;
    if (select calculation_version
        from commerce.platform_payout_liability_cache_state
        where control_key = 'default') <> 1
       or (select liability_revision from commerce.platform_payout_liability_controls
           where control_key = 'default') <> v_baseline.liability_revision
       or (select count(*) from commerce.platform_payout_liability_revisions)
            <> v_baseline.revision_count
       or exists (select 1 from commerce.platform_payout_liability_pending_orders) then
        raise exception 'platform liability: cache version fallback changed financial state';
    end if;
end;
$cache_version_fallback$;

reset role;
delete from commerce.platform_payout_order_contributions;
set local role service_role;
update commerce.platform_payout_liability_cache_state
set initialized = false, initialized_at = null
where control_key = 'default';

update commerce.order_settlements settlement
set status = status
from commerce_liability_test.orders seeded
where seeded.label = 'cache-repair-b'
  and settlement.order_id = seeded.order_id;

select commerce_liability_test.assert_cache_parity();

do $lazy_cache_initialization$
declare
    v_baseline liability_cache_baseline%rowtype;
begin
    select * into v_baseline from liability_cache_baseline;
    if (select liability_revision from commerce.platform_payout_liability_controls
        where control_key = 'default') <> v_baseline.liability_revision
       or (select count(*) from commerce.platform_payout_liability_revisions)
            <> v_baseline.revision_count
       or (select initialized_at is null
           from commerce.platform_payout_liability_cache_state
           where control_key = 'default') then
        raise exception 'platform liability: lazy cache initialization changed financial state';
    end if;
end;
$lazy_cache_initialization$;
