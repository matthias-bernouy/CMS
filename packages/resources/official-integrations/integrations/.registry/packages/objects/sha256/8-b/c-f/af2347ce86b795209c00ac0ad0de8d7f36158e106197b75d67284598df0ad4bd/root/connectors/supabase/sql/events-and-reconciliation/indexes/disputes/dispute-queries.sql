
create index if not exists disputes_payment_status_idx on stripe_connect.stripe_disputes(payment_id, status);
create index if not exists stripe_disputes_created_at_idx
    on stripe_connect.stripe_disputes(created_at desc);