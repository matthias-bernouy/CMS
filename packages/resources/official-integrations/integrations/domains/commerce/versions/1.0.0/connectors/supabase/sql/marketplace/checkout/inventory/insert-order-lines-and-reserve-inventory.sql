

create or replace function commerce.insert_order_lines_and_reserve_inventory(
    p_order_id bigint,
    p_items jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
    perform commerce.insert_order_batch_lines_and_reserve_inventory(
        jsonb_build_array(p_order_id), p_items
    );
end;
$$;