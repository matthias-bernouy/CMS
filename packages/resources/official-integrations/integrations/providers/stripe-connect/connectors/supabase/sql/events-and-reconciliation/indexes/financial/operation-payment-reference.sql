
create index if not exists financial_operations_payment_idx
    on stripe_connect.financial_operations(payment_id);