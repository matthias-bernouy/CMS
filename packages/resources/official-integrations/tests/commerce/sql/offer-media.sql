\set ON_ERROR_STOP on

begin;
set local role service_role;

do $$
declare
    v_product jsonb;
    v_seller jsonb;
    v_offer jsonb;
    v_first jsonb;
    v_second jsonb;
begin
    v_product := commerce.upsert_product(null, jsonb_build_object(
        'slug', 'offer-media-product', 'title', 'Offer media product',
        'status', 'active', 'visibility', 'public'
    ));
    v_seller := commerce.register_my_seller('offer-media-seller', 'Offer media seller');
    v_seller := commerce.review_seller((v_seller->>'id')::bigint, 'verified', 'smoke-admin', null, 1);
    v_offer := commerce.create_my_offer('offer-media-seller', jsonb_build_object(
        'productId', v_product->>'id', 'slug', 'offer-media', 'title', 'Offer media'
    ));

    v_first := commerce.attach_offer_media(
        (v_offer->>'id')::bigint, 'commerce-media', 'offers/media/one.webp',
        'image/webp', 100, 'one.webp', null, 'offer-media-seller'
    );
    v_second := commerce.attach_offer_media(
        (v_offer->>'id')::bigint, 'commerce-media', 'offers/media/two.webp',
        'image/webp', 120, 'two.webp', null, 'offer-media-seller'
    );
    if not (select is_main from commerce.offer_media where media_id = (v_first->>'media_id')::bigint) then
        raise exception 'offer media smoke: first image is not main';
    end if;

    perform commerce.reorder_offer_media(
        (v_offer->>'id')::bigint,
        jsonb_build_array((v_second->>'media_id')::bigint, (v_first->>'media_id')::bigint),
        'offer-media-seller'
    );
    if not (select is_main from commerce.offer_media where media_id = (v_second->>'media_id')::bigint) then
        raise exception 'offer media smoke: reordered image is not main';
    end if;

    begin
        perform commerce.remove_offer_media(
            (v_offer->>'id')::bigint, (v_second->>'media_id')::bigint, 'another-seller'
        );
        raise exception 'offer media smoke: another seller removed the image';
    exception when others then
        if sqlerrm = 'offer media smoke: another seller removed the image'
            or sqlerrm not like 'not_found: offer%' then raise; end if;
    end;

    perform commerce.remove_offer_media(
        (v_offer->>'id')::bigint, (v_second->>'media_id')::bigint, 'offer-media-seller'
    );
    if not (select is_main from commerce.offer_media where media_id = (v_first->>'media_id')::bigint) then
        raise exception 'offer media smoke: remaining image is not main';
    end if;
end;
$$;

rollback;
