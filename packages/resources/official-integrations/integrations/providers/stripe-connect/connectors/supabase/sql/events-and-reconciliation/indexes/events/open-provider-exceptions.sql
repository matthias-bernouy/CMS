
create index if not exists exceptions_open_idx on stripe_connect.provider_exceptions(severity, detected_at)
    where status <> 'resolved';