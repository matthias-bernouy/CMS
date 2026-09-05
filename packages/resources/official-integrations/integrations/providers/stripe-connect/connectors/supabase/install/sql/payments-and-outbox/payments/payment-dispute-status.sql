

alter table stripe_connect.payments
    drop constraint if exists payments_dispute_status_valid;

alter table stripe_connect.payments
    add constraint payments_dispute_status_valid check (
        dispute_status in ('none', 'open', 'under_review', 'won', 'lost', 'prevented', 'warning_closed')
    );
