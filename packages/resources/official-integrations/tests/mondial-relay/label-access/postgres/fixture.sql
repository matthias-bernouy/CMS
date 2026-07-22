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
        p_expires_at - interval '1 hour', p_revoked_at
    );
    return v_token_hash;
end;
$$;

create function label_access_test.wait_for_reader(p_application_name text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '5 seconds';
begin
    loop
        exit when exists (
            select 1
            from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity
              on activity.pid = lock_row.pid
            where activity.application_name = p_application_name
              and not lock_row.granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'label access: reader did not reach blocked database read';
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

grant usage on schema label_access_test to service_role;
grant execute on function label_access_test.cleanup() to service_role;
grant execute on function label_access_test.seed(
    text, text, text, text, timestamptz, timestamptz
) to service_role;
