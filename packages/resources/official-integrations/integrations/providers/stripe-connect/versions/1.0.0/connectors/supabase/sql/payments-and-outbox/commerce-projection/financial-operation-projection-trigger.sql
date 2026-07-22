

drop trigger if exists financial_operations_enqueue_commerce_projection
    on stripe_connect.financial_operations;
create trigger financial_operations_enqueue_commerce_projection
after insert or update of status on stripe_connect.financial_operations
for each row execute function stripe_connect.enqueue_commerce_financial_projection();