
create index if not exists payments_buyer_status_idx on stripe_connect.payments(buyer_cms_user_id, payment_status);
create index if not exists payments_seller_status_idx on stripe_connect.payments(seller_cms_user_id, settlement_status);
create index if not exists payments_created_at_idx on stripe_connect.payments(created_at desc);
create index if not exists payments_manual_review_idx on stripe_connect.payments(updated_at)
    where settlement_status = 'manual_review';