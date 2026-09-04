

revoke execute on function commerce.validate_order_creation_batches(
    text, jsonb, boolean, text, boolean
) from public, anon, authenticated;
revoke execute on function commerce.insert_order_batch_lines_and_reserve_inventory(jsonb, jsonb)
from public, anon, authenticated;
revoke execute on function commerce.validate_order_creation_lines(text, jsonb, boolean, text)
from public, anon, authenticated;
revoke execute on function commerce.insert_order_lines_and_reserve_inventory(bigint, jsonb)
from public, anon, authenticated;
grant execute on function commerce.validate_order_creation_lines(text, jsonb, boolean, text)
to service_role;
grant execute on function commerce.insert_order_lines_and_reserve_inventory(bigint, jsonb)
to service_role;
grant execute on function commerce.validate_order_creation_batches(
    text, jsonb, boolean, text, boolean
) to service_role;
grant execute on function commerce.insert_order_batch_lines_and_reserve_inventory(jsonb, jsonb)
to service_role;