

create or replace function delivery.issue_label_access_token(
    p_external_order_id text,
    p_seller_cms_user_id text,
    p_token_hash text,
    p_expires_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_shipment delivery.shipments%rowtype;
    v_token delivery.label_access_tokens%rowtype;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_token_hash !~ '^[a-f0-9]{64}$'
        or p_expires_at is null or p_expires_at <= now() then
        raise exception 'validation: invalid label capability';
    end if;
    select * into v_shipment from delivery.shipments
    where external_order_id = p_external_order_id for update;
    if not found then raise exception 'not_found: shipment'; end if;
    if v_shipment.seller_cms_user_id is distinct from p_seller_cms_user_id then
        raise exception 'not_found: shipment';
    end if;
    if v_shipment.status <> 'label_ready'
        or v_shipment.carrier_accepted_at is not null then
        raise exception 'conflict: the shipment label is not available';
    end if;
    insert into delivery.label_access_tokens (
        token_hash, shipment_id, seller_cms_user_id, expires_at
    ) values (
        p_token_hash, v_shipment.id, p_seller_cms_user_id, p_expires_at
    ) returning * into v_token;
    return to_jsonb(v_token);
end;
$$;