\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir ../../../../commerce/selling/offer/detail/postgres/managed-offer.fixture.sql

do $$
declare
    v_offer jsonb;
    v_seller jsonb;
    v_offer_id bigint;
begin
    select jsonb_build_object(
        'id', offer.id,
        'seller_id', offer.seller_id,
        'slug', offer.slug,
        'title', offer.title,
        'accepted_price_amount', offer.accepted_price_amount,
        'currency', offer.currency,
        'publication_status', offer.publication_status,
        'availability', offer.availability
    )
    into v_offer
    from commerce.offers offer
    where offer.slug = 'managed-offer-full';

    v_offer_id := (v_offer->>'id')::bigint;
    select jsonb_build_object(
        'id', seller.id,
        'cms_user_id', seller.cms_user_id,
        'display_name', seller.display_name
    )
    into v_seller
    from commerce.sellers seller
    where seller.id = (v_offer->>'seller_id')::bigint;

    if v_offer_id is null
        or v_offer->>'slug' <> 'managed-offer-full'
        or v_offer->>'title' <> 'Managed full offer'
        or (v_offer->>'accepted_price_amount')::bigint <> 12500
        or v_offer->>'currency' <> 'eur'
        or v_offer->>'publication_status' <> 'draft'
        or v_offer->>'availability' <> 'available'
        or v_seller->>'cms_user_id' <> 'managed-offer-owner'
        or v_seller->>'display_name' <> 'Managed owner' then
        raise exception 'negotiation context baseline changed: offer=%, seller=%',
            v_offer, v_seller;
    end if;

    if (
        select count(*)
        from commerce.offers offer
        where offer.id = v_offer_id
    ) <> 1 or (
        select count(*)
        from commerce.sellers seller
        where seller.id = (v_offer->>'seller_id')::bigint
    ) <> 1 then
        raise exception 'negotiation context baseline lookup cardinality changed';
    end if;

    if exists (
        select 1
        from commerce.offers offer
        where offer.id = 9007199254740991
    ) then
        raise exception 'negotiation context baseline missing-id fixture collided';
    end if;
end;
$$;

rollback;
