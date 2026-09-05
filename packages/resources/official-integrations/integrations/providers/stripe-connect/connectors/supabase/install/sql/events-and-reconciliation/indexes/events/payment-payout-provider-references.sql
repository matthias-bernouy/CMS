
create index if not exists payment_events_payment_idx
    on stripe_connect.payment_events(payment_id);
create index if not exists payout_events_account_idx
    on stripe_connect.payout_events(cms_user_id);
create index if not exists provider_exceptions_operation_idx
    on stripe_connect.provider_exceptions(operation_id);
create index if not exists provider_exceptions_payment_idx
    on stripe_connect.provider_exceptions(payment_id);
