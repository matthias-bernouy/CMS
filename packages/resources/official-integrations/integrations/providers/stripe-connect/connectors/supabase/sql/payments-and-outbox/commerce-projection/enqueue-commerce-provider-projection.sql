

create or replace function stripe_connect.enqueue_commerce_provider_projection(
    p_payment_id bigint,
    p_projection_key text,
    p_projection_kind text,
    p_provider_object_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_projection stripe_connect.commerce_projection_outbox%rowtype;
begin
    if nullif(btrim(p_projection_key), '') is null
        or p_projection_kind not in ('payment', 'dispute')
        or nullif(btrim(p_provider_object_id), '') is null then
        raise exception 'validation: invalid Commerce provider projection';
    end if;
    if not exists (select 1 from stripe_connect.payments where id = p_payment_id) then
        raise exception 'not_found: payment';
    end if;
    insert into stripe_connect.commerce_projection_outbox (
        payment_id, projection_key, projection_kind, provider_object_id
    ) values (
        p_payment_id, p_projection_key, p_projection_kind, p_provider_object_id
    ) on conflict (projection_key) do nothing;
    select * into v_projection
    from stripe_connect.commerce_projection_outbox
    where projection_key = p_projection_key;
    return to_jsonb(v_projection);
end;
$$;