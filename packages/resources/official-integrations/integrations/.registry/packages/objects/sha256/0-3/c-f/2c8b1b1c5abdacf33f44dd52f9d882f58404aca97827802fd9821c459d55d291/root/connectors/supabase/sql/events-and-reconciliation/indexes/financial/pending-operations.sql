
create index if not exists operations_pending_idx on stripe_connect.financial_operations(next_attempt_at, created_at)
    where status in ('reserved', 'processing', 'failed');