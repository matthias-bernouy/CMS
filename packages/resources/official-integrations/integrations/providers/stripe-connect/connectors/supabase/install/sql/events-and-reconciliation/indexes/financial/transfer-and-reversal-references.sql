
create index if not exists transfer_reversals_payment_idx
    on stripe_connect.transfer_reversals(payment_id);
create index if not exists transfer_reversals_transfer_fk_idx
    on stripe_connect.transfer_reversals(transfer_id);
create index if not exists transfers_payment_idx
    on stripe_connect.transfers(payment_id);
