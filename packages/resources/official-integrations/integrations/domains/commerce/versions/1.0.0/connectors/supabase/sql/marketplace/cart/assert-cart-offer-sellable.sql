

create or replace function commerce.assert_cart_offer_sellable(
    p_offer_id bigint,
    p_quantity integer
)
returns commerce.offers
language plpgsql
set search_path = ''
as $$
declare
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_settings commerce.settings%rowtype;
begin
    select * into v_settings from commerce.settings where id = 'default' for share;
    select * into v_offer from commerce.offers where id = p_offer_id;
    if not found then raise exception 'not_found: offer'; end if;
    if v_offer.publication_status <> 'active'
        or not exists (
            select 1 from commerce.offer_workflow_states
            where code = v_offer.workflow_state and phase = 'ready' and enabled
        )
        or v_offer.availability = 'unavailable'
        or v_offer.accepted_price_amount is null then
        raise exception 'conflict: offer % is not sellable', v_offer.id;
    end if;
    if v_offer.quantity_available is not null and v_offer.quantity_available < p_quantity then
        raise exception 'conflict: insufficient quantity for offer %', v_offer.id;
    end if;
    if not exists (
        select 1 from commerce.products
        where id = v_offer.product_id and status = 'active' and visibility = 'public'
    ) then raise exception 'conflict: product for offer % is not sellable', v_offer.id; end if;
    perform commerce.assert_product_variant_ready(v_offer.product_id, v_offer.variant_id);
    select * into v_seller from commerce.sellers where id = v_offer.seller_id;
    if v_seller.verification_status in ('rejected', 'suspended')
        or (v_settings.require_verified_seller and v_seller.verification_status <> 'verified') then
        raise exception 'conflict: seller for offer % is not allowed to sell', v_offer.id;
    end if;
    if v_settings.mode = 'ecommerce' and v_seller.kind = 'user' then
        raise exception 'conflict: marketplace offers are disabled';
    end if;
    return v_offer;
end;
$$;