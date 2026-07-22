

create or replace function commerce.get_offer_media_download_context(
    p_scope text,
    p_media_id bigint,
    p_cms_user_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_publication_status text;
    v_seller_id bigint;
    v_require_verified_seller boolean;
    v_seller_status text;
    v_seller_cms_user_id text;
    v_media jsonb;
begin
    if p_scope is null or p_scope not in ('public', 'self', 'admin') then
        return jsonb_build_object('state', 'invalid_scope');
    end if;

    if p_scope <> 'admin' then
        select offer.publication_status, offer.seller_id
        into v_publication_status, v_seller_id
        from commerce.offer_media link
        join commerce.offers offer on offer.id = link.offer_id
        where link.media_id = p_media_id
        limit 1;
        if not found or (p_scope = 'public' and v_publication_status <> 'active') then
            return jsonb_build_object('state', 'not_found');
        end if;

        if p_scope = 'public' then
            select settings.require_verified_seller
            into v_require_verified_seller
            from commerce.settings settings
            where settings.id = 'default';
            if not found then
                return jsonb_build_object('state', 'settings_unavailable');
            end if;

            select seller.verification_status
            into v_seller_status
            from commerce.sellers seller
            where seller.id = v_seller_id;
            if not found
                or v_seller_status in ('rejected', 'suspended')
                or (v_require_verified_seller and v_seller_status <> 'verified')
            then
                return jsonb_build_object('state', 'seller_unavailable');
            end if;
        else
            select seller.cms_user_id
            into v_seller_cms_user_id
            from commerce.sellers seller
            where seller.id = v_seller_id;
            if not found then
                return jsonb_build_object('state', 'not_found');
            end if;
            if p_cms_user_id is null then
                return jsonb_build_object('state', 'identity_required');
            end if;
            if v_seller_cms_user_id is distinct from p_cms_user_id then
                return jsonb_build_object('state', 'not_found');
            end if;
        end if;
    end if;

    select jsonb_build_object(
        'id', media.id,
        'storage_bucket', media.storage_bucket,
        'storage_path', media.storage_path,
        'mime_type', media.mime_type
    )
    into v_media
    from commerce.media media
    where media.id = p_media_id;
    if not found then
        return jsonb_build_object('state', 'not_found');
    end if;
    return jsonb_build_object('state', 'ok', 'media', v_media);
end;
$$;

revoke execute on function commerce.get_offer_media_download_context(text, bigint, text)
    from public, anon, authenticated;
grant execute on function commerce.get_offer_media_download_context(text, bigint, text)
    to service_role;