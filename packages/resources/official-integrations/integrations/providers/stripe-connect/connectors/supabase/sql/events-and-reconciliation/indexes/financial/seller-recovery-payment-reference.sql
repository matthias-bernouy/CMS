
create index if not exists seller_recovery_exposures_payment_idx
    on stripe_connect.seller_recovery_exposures(payment_id);