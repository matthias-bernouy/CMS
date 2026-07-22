

comment on schema stripe_connect is
    'Private Stripe provider ledger for protected C2C platform charges and separate Transfers.';
comment on table stripe_connect.payments is
    'Immutable payment allocation and independent payment, settlement, and dispute projections.';
comment on table stripe_connect.marketplace_terms_acceptances is
    'Immutable, server-timestamped proof that a CMS seller accepted one exact marketplace agreement version and SHA-256 document hash.';
comment on table stripe_connect.payment_lifecycle_guards is
    'Serialized create-versus-cancel guard; an absent-payment cancellation is a durable tombstone that permanently rejects later provider creation.';
comment on table stripe_connect.financial_operations is
    'Durable idempotent operation reservations around non-transactional Stripe API calls.';
comment on table stripe_connect.stripe_events is
    'Raw, signature-verified Stripe events persisted before acknowledgement.';