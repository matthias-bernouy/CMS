

create table if not exists stripe_connect.marketplace_terms_acceptances (
    cms_user_id text not null references stripe_connect.accounts(cms_user_id),
    terms_version text not null,
    terms_hash text not null,
    accepted_at timestamptz not null default now(),
    primary key (cms_user_id, terms_version),
    constraint marketplace_terms_acceptances_user_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint marketplace_terms_acceptances_version_valid check (
        length(btrim(terms_version)) between 1 and 200
    ),
    constraint marketplace_terms_acceptances_hash_valid check (terms_hash ~ '^[0-9a-f]{64}$')
);