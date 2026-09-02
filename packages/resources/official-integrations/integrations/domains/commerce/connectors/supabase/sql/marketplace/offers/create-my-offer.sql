

create or replace function commerce.create_my_offer(
    p_cms_user_id text,
    p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_seller commerce.sellers%rowtype;
    v_product commerce.products%rowtype;
    v_offer commerce.offers%rowtype;
    v_metadata jsonb := coalesce(p_payload->'metadata', '{}'::jsonb);
    v_product_id bigint;
    v_variant_id bigint;
begin
    select * into v_settings from commerce.settings where id = 'default' for share;
    if v_settings.mode = 'ecommerce' then
        raise exception 'forbidden: marketplace offers are disabled';
    end if;
    select * into v_seller from commerce.sellers where cms_user_id = p_cms_user_id for share;
    if not found then raise exception 'forbidden: register as a seller first'; end if;
    if v_seller.verification_status in ('rejected', 'suspended') then
        raise exception 'forbidden: seller is not allowed to sell';
    end if;

    v_product_id := nullif(p_payload->>'productId', '')::bigint;
    v_variant_id := nullif(p_payload->>'variantId', '')::bigint;
    select * into v_product from commerce.products
    where id = v_product_id and status = 'active' and visibility = 'public';
    if not found then
        raise exception 'validation: an active public product is required';
    end if;
    perform commerce.assert_product_variant_ready(v_product_id, v_variant_id);
    if not exists (
        select 1 from commerce.offer_conditions
        where code = coalesce(nullif(p_payload->>'conditionCode', ''), 'good') and enabled
    ) then
        raise exception 'validation: unsupported offer condition';
    end if;
    perform commerce.assert_custom_fields('offer', v_metadata, 'self');

    insert into commerce.offers (
        seller_id, product_id, variant_id, slug, title, description,
        condition_code, currency, availability, quantity_available, metadata
    ) values (
        v_seller.id,
        v_product_id,
        v_variant_id,
        lower(btrim(p_payload->>'slug')),
        coalesce(nullif(btrim(p_payload->>'title'), ''), v_product.title),
        nullif(btrim(p_payload->>'description'), ''),
        coalesce(nullif(p_payload->>'conditionCode', ''), 'good'),
        lower(coalesce(nullif(p_payload->>'currency', ''), v_settings.default_currency)),
        coalesce(nullif(p_payload->>'availability', ''), 'available'),
        nullif(p_payload->>'quantityAvailable', '')::integer,
        v_metadata
    ) returning * into v_offer;

    insert into commerce.offer_events (
        offer_id, event_type, actor_kind, actor_id, previous_workflow_state, next_workflow_state
    ) values (v_offer.id, 'created', 'seller', p_cms_user_id, null, v_offer.workflow_state);
    return to_jsonb(v_offer);
end;
$$;