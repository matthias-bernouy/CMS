select commerce_liability_test.seed_order('performance-template', 10000);

reset role;
alter table commerce.order_financial_terms
    disable trigger order_financial_terms_platform_liability_insert_delete;
alter table commerce.order_settlements
    disable trigger order_settlements_platform_liability;
alter table commerce.order_settlements
    disable trigger order_settlements_platform_liability_flush;
alter table commerce.platform_payout_order_liabilities
    disable trigger platform_payout_order_liabilities_dirty_insert_delete;
set local role service_role;

insert into commerce.checkout_groups (
    id, buyer_cms_user_id, idempotency_key, request_hash
)
select pg_catalog.md5('liability-performance-group-' || series.value)::uuid,
    'liability-performance-buyer-' || series.value,
    'liability-performance-checkout-' || series.value,
    pg_catalog.md5('liability-performance-request-' || series.value)
from generate_series(1, 9999) series(value);

insert into commerce.orders (
    public_id, order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    status, currency, subtotal_amount, total_amount, idempotency_key, request_hash
)
select pg_catalog.md5('liability-performance-order-' || series.value)::uuid,
    'LIABILITY-PERFORMANCE-' || series.value,
    pg_catalog.md5('liability-performance-group-' || series.value)::uuid,
    seller.id, 'liability-performance-buyer-' || series.value,
    'awaiting_payment', 'eur', 10000, 10000,
    'liability-performance-checkout-' || series.value,
    pg_catalog.md5('liability-performance-request-' || series.value)
from generate_series(1, 9999) series(value)
cross join lateral (
    select id from commerce.sellers where slug = 'liability-contract-seller'
) seller;

insert into commerce.order_financial_terms
select (pg_catalog.jsonb_populate_record(
    null::commerce.order_financial_terms,
    to_jsonb(template_terms) || jsonb_build_object('order_id', target.id)
)).*
from commerce.orders target
cross join lateral (
    select terms.*
    from commerce.order_financial_terms terms
    join commerce_liability_test.orders seeded on seeded.order_id = terms.order_id
    where seeded.label = 'performance-template'
) template_terms
where target.order_number ~ '^LIABILITY-PERFORMANCE-[0-9]+$';

insert into commerce.order_settlements
select (pg_catalog.jsonb_populate_record(
    null::commerce.order_settlements,
    to_jsonb(template_settlement) || jsonb_build_object('order_id', target.id)
)).*
from commerce.orders target
cross join lateral (
    select settlement.*
    from commerce.order_settlements settlement
    join commerce_liability_test.orders seeded
        on seeded.order_id = settlement.order_id
    where seeded.label = 'performance-template'
) template_settlement
where target.order_number ~ '^LIABILITY-PERFORMANCE-[0-9]+$';

insert into commerce.platform_payout_order_liabilities (order_id)
select target.id
from commerce.orders target
where target.order_number ~ '^LIABILITY-PERFORMANCE-[0-9]+$';

reset role;
alter table commerce.order_financial_terms
    enable trigger order_financial_terms_platform_liability_insert_delete;
alter table commerce.order_settlements
    enable trigger order_settlements_platform_liability;
alter table commerce.order_settlements
    enable trigger order_settlements_platform_liability_flush;
alter table commerce.platform_payout_order_liabilities
    enable trigger platform_payout_order_liabilities_dirty_insert_delete;
set local role service_role;

select commerce.refresh_platform_payout_liability(
    'Performance fixture initialization', null
);

select commerce.refresh_platform_payout_liability_delta(
    array[(select order_id from commerce_liability_test.orders
        where label = 'performance-template')],
    'Performance cache warmup', null
);

update commerce.platform_payout_order_liabilities liability
set lifecycle_status = 'active', risk_release_at = now() - interval '1 day'
where liability.order_id = (
    select id from commerce.orders where order_number = 'LIABILITY-PERFORMANCE-1'
);

update commerce.platform_payout_order_contributions contribution
set next_reconciliation_at = '-infinity'::timestamptz
where contribution.order_id = (
    select id from commerce.orders where order_number = 'LIABILITY-PERFORMANCE-1'
);

reset role;
analyze commerce.platform_payout_order_contributions;
analyze commerce.platform_payout_order_liabilities;
analyze commerce.order_settlements;
analyze commerce.order_financial_terms;
analyze commerce.stripe_dispute_projections;
set local role service_role;

do $performance_budget$
declare
    v_delta_plan jsonb;
    v_due_plan jsonb;
    v_full_plan jsonb;
    v_shared_blocks bigint;
    v_temp_blocks bigint;
begin
    execute $plan$explain (format json)
        select contribution.order_id
        from commerce.platform_payout_order_contributions contribution
        where contribution.next_reconciliation_at <= now()$plan$
    into v_due_plan;
    if v_due_plan::text not like '%platform_payout_order_contributions_due_idx%' then
        raise exception 'platform liability: due reconciliation index is not used: %',
            v_due_plan;
    end if;
    execute $plan$explain (analyze, buffers, timing off, format json)
        select commerce.refresh_platform_payout_liability_delta(
            array[(select order_id from commerce_liability_test.orders
                where label = 'performance-template')],
            'Measured targeted delta', null
        )$plan$ into v_delta_plan;
    v_shared_blocks := coalesce(
        (v_delta_plan->0->'Plan'->>'Shared Hit Blocks')::bigint, 0
    ) + coalesce((v_delta_plan->0->'Plan'->>'Shared Read Blocks')::bigint, 0);
    v_temp_blocks := coalesce(
        (v_delta_plan->0->'Plan'->>'Temp Read Blocks')::bigint, 0
    ) + coalesce((v_delta_plan->0->'Plan'->>'Temp Written Blocks')::bigint, 0);
    raise notice 'platform liability targeted delta: % shared buffers, % ms',
        v_shared_blocks, v_delta_plan->0->>'Execution Time';
    if v_shared_blocks >= 512 or v_temp_blocks <> 0 then
        raise exception 'platform liability: targeted delta exceeded buffer budget: %',
            v_delta_plan;
    end if;
    execute $plan$explain (analyze, buffers, timing off, format json)
        select commerce.refresh_platform_payout_liability(
            'Measured unchanged full reconciliation', null
        )$plan$ into v_full_plan;
    v_shared_blocks := coalesce(
        (v_full_plan->0->'Plan'->>'Shared Hit Blocks')::bigint, 0
    ) + coalesce((v_full_plan->0->'Plan'->>'Shared Read Blocks')::bigint, 0);
    v_temp_blocks := coalesce(
        (v_full_plan->0->'Plan'->>'Temp Read Blocks')::bigint, 0
    ) + coalesce((v_full_plan->0->'Plan'->>'Temp Written Blocks')::bigint, 0);
    raise notice 'platform liability unchanged full: % shared buffers, % ms',
        v_shared_blocks, v_full_plan->0->>'Execution Time';
    if v_shared_blocks >= 16384 or v_temp_blocks <> 0 then
        raise exception 'platform liability: unchanged full exceeded buffer budget: %',
            v_full_plan;
    end if;
end;
$performance_budget$;

select commerce_liability_test.assert_cache_parity();
