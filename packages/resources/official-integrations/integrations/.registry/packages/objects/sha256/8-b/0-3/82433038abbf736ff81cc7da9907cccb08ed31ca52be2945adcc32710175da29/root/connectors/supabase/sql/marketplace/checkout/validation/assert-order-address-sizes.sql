

create or replace function commerce.assert_order_address_sizes(
    p_shipping_address jsonb,
    p_billing_address jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
    if pg_column_size(p_shipping_address) > 65536 then
        raise check_violation using
            message = 'new row for relation "orders" violates check constraint "orders_shipping_address_size"',
            schema = 'commerce', table = 'orders',
            constraint = 'orders_shipping_address_size';
    end if;
    if pg_column_size(p_billing_address) > 65536 then
        raise check_violation using
            message = 'new row for relation "orders" violates check constraint "orders_billing_address_size"',
            schema = 'commerce', table = 'orders',
            constraint = 'orders_billing_address_size';
    end if;
end;
$$;

revoke execute on function commerce.assert_order_address_sizes(jsonb, jsonb)
from public, anon, authenticated;
grant execute on function commerce.assert_order_address_sizes(jsonb, jsonb)
to service_role;