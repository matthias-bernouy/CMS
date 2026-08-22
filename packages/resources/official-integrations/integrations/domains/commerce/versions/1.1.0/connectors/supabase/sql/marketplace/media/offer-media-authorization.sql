create or replace function commerce.authorize_offer_media_upload(
    p_offer_id bigint,
    p_replace_media_id bigint default null,
    p_cms_user_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_max_count integer;
begin
    perform offer.id
    from commerce.offers offer
    join commerce.sellers seller on seller.id = offer.seller_id
    where offer.id = p_offer_id
      and (p_cms_user_id is null or seller.cms_user_id = p_cms_user_id);
    if not found then raise exception 'not_found: offer'; end if;
    if p_replace_media_id is not null and not exists (
        select 1 from commerce.offer_media
        where offer_id = p_offer_id and media_id = p_replace_media_id
    ) then
        raise exception 'not_found: offer image';
    end if;
    if p_replace_media_id is null then
        select offer_image_max_count into v_max_count
        from commerce.settings where id = 'default';
        if (select count(*) from commerce.offer_media where offer_id = p_offer_id) >= v_max_count then
            raise exception 'validation: an offer cannot have more than % images', v_max_count;
        end if;
    end if;
    return jsonb_build_object(
        'state', 'authorized',
        'offer_id', p_offer_id,
        'replace_media_id', p_replace_media_id
    );
end;
$$;

revoke execute on function commerce.authorize_offer_media_upload(bigint, bigint, text)
from public, anon, authenticated;
grant execute on function commerce.authorize_offer_media_upload(bigint, bigint, text)
to service_role;
