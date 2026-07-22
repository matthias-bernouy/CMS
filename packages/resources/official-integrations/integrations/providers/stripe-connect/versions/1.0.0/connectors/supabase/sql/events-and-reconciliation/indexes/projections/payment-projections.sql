
create index if not exists commerce_projection_outbox_payment_idx
    on stripe_connect.commerce_projection_outbox(payment_id);