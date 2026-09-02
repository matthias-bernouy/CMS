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
    v_context jsonb;
    v_admin_media_id bigint;
begin
    if has_function_privilege(
        'anon', 'commerce.get_offer_media_download_context(text,bigint,text)', 'execute'
    ) or has_function_privilege(
        'authenticated', 'commerce.get_offer_media_download_context(text,bigint,text)', 'execute'
    ) or not has_function_privilege(
        'service_role', 'commerce.get_offer_media_download_context(text,bigint,text)', 'execute'
    ) then
        raise exception 'offer media smoke: download context privileges are unsafe';
    end if;
    if exists (
        select 1
        from pg_proc
        where oid = 'commerce.get_offer_media_download_context(text,bigint,text)'::regprocedure
          and (prosecdef or provolatile <> 's' or not ('search_path=""' = any(coalesce(proconfig, '{}'::text[]))))
    ) then
        raise exception 'offer media smoke: download context execution settings are unsafe';
    end if;

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
    update commerce.offers
    set publication_status = 'active', accepted_price_amount = 12000
    where id = (v_offer->>'id')::bigint;

    v_context := commerce.get_offer_media_download_context(
        'public', (v_first->>'media_id')::bigint, null
    );
    if v_context->>'state' <> 'ok'
        or v_context->'media'->>'storage_path' <> 'offers/media/one.webp'
        or (v_context->'media') ?| array['file_size', 'original_filename'] then
        raise exception 'offer media smoke: public download context changed %', v_context;
    end if;
    v_context := commerce.get_offer_media_download_context(
        'self', (v_first->>'media_id')::bigint, 'offer-media-seller'
    );
    if v_context->>'state' <> 'ok' then
        raise exception 'offer media smoke: owner download context changed %', v_context;
    end if;
    if commerce.get_offer_media_download_context(
        'self', (v_first->>'media_id')::bigint, null
    )->>'state' <> 'identity_required' then
        raise exception 'offer media smoke: missing owner identity was not delayed';
    end if;
    if commerce.get_offer_media_download_context(
        'self', (v_first->>'media_id')::bigint, 'another-seller'
    )->>'state' <> 'not_found' then
        raise exception 'offer media smoke: another seller accessed the image';
    end if;

    update commerce.sellers
    set kind = 'external', cms_user_id = null
    where id = (v_seller->>'id')::bigint;
    if commerce.get_offer_media_download_context(
        'self', (v_first->>'media_id')::bigint, 'offer-media-seller'
    )->>'state' <> 'not_found' then
        raise exception 'offer media smoke: ownerless seller accessed the image';
    end if;
    update commerce.sellers
    set kind = 'user', cms_user_id = 'offer-media-seller'
    where id = (v_seller->>'id')::bigint;

    update commerce.offers set publication_status = 'draft'
    where id = (v_offer->>'id')::bigint;
    if commerce.get_offer_media_download_context(
        'public', (v_first->>'media_id')::bigint, null
    )->>'state' <> 'not_found' then
        raise exception 'offer media smoke: unpublished image became public';
    end if;
    update commerce.offers set publication_status = 'active'
    where id = (v_offer->>'id')::bigint;

    insert into commerce.media (
        storage_bucket, storage_path, mime_type, file_size, original_filename
    ) values (
        'commerce-media', 'offers/media/admin.webp', 'image/webp', 80, 'admin.webp'
    ) returning id into v_admin_media_id;
    if commerce.get_offer_media_download_context(
        'admin', v_admin_media_id, null
    )->>'state' <> 'ok' or commerce.get_offer_media_download_context(
        'public', v_admin_media_id, null
    )->>'state' <> 'not_found' then
        raise exception 'offer media smoke: unlinked administrator media boundary changed';
    end if;

    update commerce.sellers set verification_status = 'suspended'
    where id = (v_seller->>'id')::bigint;
    if commerce.get_offer_media_download_context(
        'public', (v_first->>'media_id')::bigint, null
    )->>'state' <> 'seller_unavailable' then
        raise exception 'offer media smoke: suspended seller image became public';
    end if;
    update commerce.sellers set verification_status = 'verified'
    where id = (v_seller->>'id')::bigint;

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
