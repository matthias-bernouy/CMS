
create index if not exists stripe_events_pending_idx on stripe_connect.stripe_events(received_at)
    where processing_status in ('pending', 'failed');
