

create or replace function commerce.collect_order_platform_payout_liability()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_reserve_liability_days integer;
begin
    if tg_table_name = 'order_payment_attempts' then
        if new.status = 'succeeded' then
            select risk.reserve_liability_days
            into v_reserve_liability_days
            from commerce.order_financial_terms terms
            join commerce.seller_risk_policies risk on risk.id = terms.seller_risk_policy_id
            where terms.order_id = new.order_id;
            insert into commerce.platform_payout_order_liabilities (
                order_id, lifecycle_status, risk_release_at
            ) values (
                new.order_id, 'active',
                coalesce(new.succeeded_at, new.updated_at, now())
                    + make_interval(days => v_reserve_liability_days)
            ) on conflict (order_id) do update set
                lifecycle_status = 'active',
                risk_release_at = excluded.risk_release_at,
                updated_at = now();
        elsif new.status in ('failed', 'cancelled') then
            insert into commerce.platform_payout_order_liabilities (
                order_id, lifecycle_status, risk_release_at
            ) values (
                new.order_id, 'released', null
            ) on conflict (order_id) do update set
                lifecycle_status = 'released', risk_release_at = null, updated_at = now()
            where commerce.platform_payout_order_liabilities.lifecycle_status <> 'active';
        else
            insert into commerce.platform_payout_order_liabilities (
                order_id, lifecycle_status, risk_release_at
            ) values (
                new.order_id, 'provisional', null
            ) on conflict (order_id) do update set updated_at = now()
            where commerce.platform_payout_order_liabilities.lifecycle_status = 'provisional';
        end if;
    end if;
    insert into commerce.platform_payout_liability_pending_orders (
        transaction_id, trigger_depth, source_table, order_id
    ) values (
        pg_catalog.pg_current_xact_id(), pg_catalog.pg_trigger_depth(),
        tg_table_name, new.order_id
    );
    if tg_table_name = 'order_payment_attempts' then
        perform commerce.refresh_platform_payout_liability_delta(
            array[new.order_id],
            'Transactional order_payment_attempts projection refresh', null
        );
    end if;
    return new;
end;
$$;

create or replace function commerce.flush_platform_payout_liability_statement()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_order_ids bigint[];
begin
    select array_agg(distinct pending.order_id order by pending.order_id)
    into v_order_ids
    from commerce.platform_payout_liability_pending_orders pending
    where pending.transaction_id = pg_catalog.pg_current_xact_id()
      and pending.trigger_depth = pg_catalog.pg_trigger_depth()
      and pending.source_table = tg_table_name;
    if coalesce(cardinality(v_order_ids), 0) = 0 then
        return null;
    end if;
    perform commerce.refresh_platform_payout_liability_delta(
        v_order_ids,
        'Transactional ' || tg_table_name || ' projection refresh', null
    );
    return null;
end;
$$;