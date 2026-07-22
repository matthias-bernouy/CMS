drop schema if exists label_access_test cascade;
create schema label_access_test;

create function label_access_test.cleanup()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from delivery.label_access_tokens
    where seller_cms_user_id like 'label-access-pg-%';
    delete from delivery.shipments
    where id like 'label-access-pg-%';
end;
$$;

create function label_access_test.seed(
    p_suffix text,
    p_token_character text,
    p_status text,
    p_label_url text,
    p_expires_at timestamptz,
    p_revoked_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_token_hash text := pg_catalog.repeat(p_token_character, 64);
begin
    insert into delivery.shipments (
        id, external_order_id, idempotency_key, expedition_number,
        status, seller_cms_user_id, label_url, recipient_name,
        recipient_postal_code, recipient_city, weight_grams
    ) values (
        'label-access-pg-' || p_suffix,
        'label-access-pg-order-' || p_suffix,
        'label-access-pg-order-' || p_suffix,
        'label-access-pg-expedition-' || p_suffix,
        p_status, 'label-access-pg-seller', p_label_url,
        'Private Buyer', '75001', 'Paris', 500
    );
    insert into delivery.label_access_tokens (
        token_hash, shipment_id, seller_cms_user_id,
        expires_at, created_at, revoked_at
    ) values (
        v_token_hash, 'label-access-pg-' || p_suffix,
        'label-access-pg-seller', p_expires_at,
        '2026-07-22 09:00:00+00', p_revoked_at
    );
    return v_token_hash;
end;
$$;

grant usage on schema label_access_test to service_role;
grant execute on function label_access_test.cleanup() to service_role;
grant execute on function label_access_test.seed(
    text, text, text, text, timestamptz, timestamptz
) to service_role;
