create temporary table liability_race_baseline as
select liability_revision,
    required_minimum_amount
from commerce.platform_payout_liability_controls
where control_key = 'default';

select pg_catalog.pg_advisory_lock(
    pg_catalog.hashtextextended('commerce:platform-payout-liability', 0)
);
select public.dblink_connect(
    'liability_race_a', 'dbname=' || current_database()
        || ' application_name=liability_race_a options=-cstatement_timeout=10000'
);
select public.dblink_connect(
    'liability_race_b', 'dbname=' || current_database()
        || ' application_name=liability_race_b options=-cstatement_timeout=10000'
);
select public.dblink_exec('liability_race_a', 'set role service_role');
select public.dblink_exec('liability_race_b', 'set role service_role');
select public.dblink_send_query(
    'liability_race_a',
    $$select commerce_liability_test.update_transfer('race-a', 31)$$
);
select commerce_liability_test.wait_until_blocked('liability_race_a');
select public.dblink_send_query(
    'liability_race_b',
    $$select commerce_liability_test.update_transfer('race-b', 47)$$
);
select commerce_liability_test.wait_until_blocked('liability_race_b');
select pg_catalog.pg_advisory_unlock(
    pg_catalog.hashtextextended('commerce:platform-payout-liability', 0)
);

create temporary table liability_race_results (result jsonb not null);
insert into liability_race_results
select result
from public.dblink_get_result('liability_race_a') response(result jsonb);
insert into liability_race_results
select result
from public.dblink_get_result('liability_race_b') response(result jsonb);

do $concurrent_deltas$
declare
    v_control commerce.platform_payout_liability_controls%rowtype;
    v_baseline liability_race_baseline%rowtype;
begin
    select * into v_baseline from liability_race_baseline;
    select * into v_control
    from commerce.platform_payout_liability_controls where control_key = 'default';
    if (select count(*) from liability_race_results) <> 2
       or v_control.required_minimum_amount
            <> v_baseline.required_minimum_amount - 31 - 47
       or v_control.liability_revision <> v_baseline.liability_revision + 2
       or (select count(*) from commerce.platform_payout_liability_revisions
           where liability_revision > v_baseline.liability_revision) <> 2
       or not exists (
           select 1 from commerce.platform_payout_liability_revisions
           where liability_revision = v_baseline.liability_revision + 1
             and required_minimum_amount in (
                v_baseline.required_minimum_amount - 31,
                v_baseline.required_minimum_amount - 47
             )
       )
       or not exists (
           select 1 from commerce.platform_payout_liability_revisions
           where liability_revision = v_baseline.liability_revision + 2
             and required_minimum_amount
                = v_baseline.required_minimum_amount - 31 - 47
       )
       or (select total_transferred_amount from commerce.order_settlements
           where order_id = (select order_id from commerce_liability_test.orders
               where label = 'race-a')) <> 31
       or (select total_transferred_amount from commerce.order_settlements
           where order_id = (select order_id from commerce_liability_test.orders
               where label = 'race-b')) <> 47 then
        raise exception 'platform liability: concurrent deltas were lost: %, %',
            to_jsonb(v_control),
            (select jsonb_agg(result) from liability_race_results);
    end if;
end;
$concurrent_deltas$;

select commerce_liability_test.assert_cache_parity();

do $concurrent_queue$
begin
    if exists (select 1 from commerce.platform_payout_liability_pending_orders) then
        raise exception 'platform liability: concurrent refresh left pending work';
    end if;
end;
$concurrent_queue$;

select public.dblink_disconnect('liability_race_a');
select public.dblink_disconnect('liability_race_b');
