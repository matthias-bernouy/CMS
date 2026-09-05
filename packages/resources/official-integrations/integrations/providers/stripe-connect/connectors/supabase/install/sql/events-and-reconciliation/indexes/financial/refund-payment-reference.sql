
create index if not exists refunds_payment_idx
    on stripe_connect.refunds(payment_id);
