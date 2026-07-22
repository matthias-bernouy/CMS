

create or replace function commerce.queue_platform_payout_liability_order()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_order_id bigint;
begin
    v_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    insert into commerce.platform_payout_liability_pending_orders (
        transaction_id, trigger_depth, source_table,
        order_id, requires_full_reconciliation
    ) values (
        pg_catalog.pg_current_xact_id(), pg_catalog.pg_trigger_depth(), tg_table_name,
        v_order_id,
        tg_table_name = 'platform_payout_order_liabilities' and tg_op = 'DELETE'
    );
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;