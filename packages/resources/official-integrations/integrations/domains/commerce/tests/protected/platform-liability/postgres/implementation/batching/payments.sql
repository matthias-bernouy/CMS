select commerce_liability_test.seed_order('batch-payment-active', 10000);
select commerce_liability_test.seed_order('batch-payment-released', 20000);

create temporary table payment_batch_baseline as
select control.liability_revision,
    control.required_minimum_amount,
    (select count(*) from commerce.platform_payout_liability_revisions) as revision_count,
    (select contribution.seller_liability_amount
            + contribution.risk_reserve_liability_amount
     from commerce.platform_payout_order_contributions contribution
     join commerce_liability_test.orders seeded
        on seeded.order_id = contribution.order_id
     where seeded.label = 'batch-payment-released') as released_contribution,
    coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
        where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
            ::regprocedure), 0) as delta_calls
from commerce.platform_payout_liability_controls control
where control.control_key = 'default';

with attempt_rows(label, ordinal, status, succeeded_at, failed_at) as (
    values
        ('batch-payment-active', 1, 'failed', null::timestamptz, now()),
        ('batch-payment-active', 2, 'succeeded', now(), null::timestamptz),
        ('batch-payment-active', 3, 'processing', null::timestamptz, null::timestamptz),
        ('batch-payment-released', 1, 'failed', null::timestamptz, now()),
        ('batch-payment-released', 2, 'processing', null::timestamptz, null::timestamptz)
)
insert into commerce.order_payment_attempts (
    order_id, client_reference_id, status, amount, currency,
    financial_terms_hash, succeeded_at, failed_at
)
select seeded.order_id,
    'liability-' || attempt.label || '-' || attempt.ordinal,
    attempt.status, terms.buyer_total_amount, terms.currency,
    terms.financial_terms_hash, attempt.succeeded_at, attempt.failed_at
from attempt_rows attempt
join commerce_liability_test.orders seeded on seeded.label = attempt.label
join commerce.order_financial_terms terms on terms.order_id = seeded.order_id
order by attempt.label, attempt.ordinal;

select commerce_liability_test.assert_cache_parity();

do $payment_batch_budget$
declare
    v_active commerce.platform_payout_order_liabilities%rowtype;
    v_baseline payment_batch_baseline%rowtype;
    v_released commerce.platform_payout_order_liabilities%rowtype;
begin
    select * into v_baseline from payment_batch_baseline;
    select liability.* into v_active
    from commerce.platform_payout_order_liabilities liability
    join commerce_liability_test.orders seeded on seeded.order_id = liability.order_id
    where seeded.label = 'batch-payment-active';
    select liability.* into v_released
    from commerce.platform_payout_order_liabilities liability
    join commerce_liability_test.orders seeded on seeded.order_id = liability.order_id
    where seeded.label = 'batch-payment-released';
    if coalesce((select calls from pg_catalog.pg_stat_xact_user_functions
            where funcid = 'commerce.refresh_platform_payout_liability_delta(bigint[],text,bigint)'
                ::regprocedure), 0) <> v_baseline.delta_calls + 5
       or (select liability_revision from commerce.platform_payout_liability_controls
           where control_key = 'default') <> v_baseline.liability_revision + 3
       or (select required_minimum_amount
           from commerce.platform_payout_liability_controls where control_key = 'default')
            <> v_baseline.required_minimum_amount - v_baseline.released_contribution
       or (select count(*) from commerce.platform_payout_liability_revisions)
            <> v_baseline.revision_count + 3
       or v_active.lifecycle_status <> 'active'
       or v_active.risk_release_at <= now()
       or v_released.lifecycle_status <> 'released'
       or v_released.risk_release_at is not null
       or exists (select 1 from commerce.platform_payout_liability_pending_orders) then
        raise exception 'platform liability: payment batch history or budget changed';
    end if;
end;
$payment_batch_budget$;
