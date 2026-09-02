

-- ---------------------------------------------------------------------------
-- Short-lived seller label capabilities
-- ---------------------------------------------------------------------------
create table if not exists delivery.label_access_tokens (
    token_hash text primary key,
    shipment_id text not null references delivery.shipments(id) on delete cascade,
    seller_cms_user_id text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    constraint label_access_tokens_hash_not_blank check (length(btrim(token_hash)) > 0),
    constraint label_access_tokens_seller_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint label_access_tokens_expiry_future check (expires_at > created_at)
);

create index if not exists label_access_tokens_expiry_idx
    on delivery.label_access_tokens(expires_at);
create index if not exists label_access_tokens_shipment_idx
    on delivery.label_access_tokens(shipment_id);