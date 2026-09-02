

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
    v_has_link boolean;
    v_has_active_link boolean;
    v_is_authorized boolean;
    v_require_verified_seller boolean;
    v_media jsonb;
begin
    if p_scope is null or p_scope not in ('public', 'self', 'admin') then
        return jsonb_build_object('state', 'invalid_scope');
    end if;

    select exists (
        select 1
        from commerce.offer_media link
        join commerce.media stored
          on stored.id = link.media_id
         and stored.detached_at is null
        where link.media_id = p_media_id
    )
    into v_has_link;
    if not v_has_link then
        return jsonb_build_object('state', 'not_found');
    end if;

    if p_scope = 'public' then
        select exists (
            select 1
            from commerce.offer_media link
            join commerce.offers offer on offer.id = link.offer_id
            where link.media_id = p_media_id
              and offer.publication_status = 'active'
        )
        into v_has_active_link;
        if not v_has_active_link then
            return jsonb_build_object('state', 'not_found');
        end if;

        select settings.require_verified_seller
        into v_require_verified_seller
        from commerce.settings settings
        where settings.id = 'default';
        if not found then
            return jsonb_build_object('state', 'settings_unavailable');
        end if;

        select exists (
            select 1
            from commerce.offer_media link
            join commerce.offers offer on offer.id = link.offer_id
            join commerce.sellers seller on seller.id = offer.seller_id
            where link.media_id = p_media_id
              and offer.publication_status = 'active'
              and seller.verification_status not in ('rejected', 'suspended')
              and (
                  not v_require_verified_seller
                  or seller.verification_status = 'verified'
              )
        )
        into v_is_authorized;
        if not v_is_authorized then
            return jsonb_build_object('state', 'seller_unavailable');
        end if;
    elsif p_scope = 'self' then
        if p_cms_user_id is null then
            return jsonb_build_object('state', 'identity_required');
        end if;

        select exists (
            select 1
            from commerce.offer_media link
            join commerce.offers offer on offer.id = link.offer_id
            join commerce.sellers seller on seller.id = offer.seller_id
            where link.media_id = p_media_id
              and seller.cms_user_id = p_cms_user_id
        )
        into v_is_authorized;
        if not v_is_authorized then
            return jsonb_build_object('state', 'not_found');
        end if;
    end if;

    select jsonb_build_object(
        'id', media.id,
        'storage_bucket', media.storage_bucket,
        'storage_path', media.storage_path,
        'mime_type', media.mime_type,
        'width', media.width,
        'height', media.height
    )
    into v_media
    from commerce.media media
    where media.id = p_media_id
      and media.detached_at is null
      and exists (
          select 1
          from commerce.offer_media link
          where link.media_id = media.id
      );
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
