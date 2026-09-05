create or replace function commerce.remove_offer_media(
    p_offer_id bigint,
    p_media_id bigint,
    p_cms_user_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_link commerce.offer_media%rowtype;
    v_offer commerce.offers%rowtype;
    v_settings commerce.settings%rowtype;
    v_detached_at timestamptz;
begin
    select offer.* into v_offer
    from commerce.offers offer
    join commerce.sellers seller on seller.id = offer.seller_id
    where offer.id = p_offer_id
      and (p_cms_user_id is null or seller.cms_user_id = p_cms_user_id)
    for update of offer;
    if not found then raise exception 'not_found: offer'; end if;
    select * into v_settings from commerce.settings where id = 'default' for share;
    if v_offer.workflow_state <> 'draft' and (
        select count(*) from commerce.offer_media where offer_id = p_offer_id
    ) <= v_settings.offer_image_min_count then
        raise exception 'validation: a submitted offer must keep at least % images',
            v_settings.offer_image_min_count;
    end if;
    select * into v_link
    from commerce.offer_media
    where offer_id = p_offer_id and media_id = p_media_id
    for update;
    if not found then raise exception 'not_found: offer image'; end if;
    perform 1 from commerce.media where id = p_media_id for update;
    delete from commerce.offer_media where id = v_link.id;
    if not exists (
        select 1 from commerce.product_media where media_id = p_media_id
    ) and not exists (
        select 1 from commerce.offer_media where media_id = p_media_id
    ) then
        update commerce.media
        set detached_at = coalesce(detached_at, now())
        where id = p_media_id
        returning detached_at into v_detached_at;
    end if;
    if v_link.is_main then
        update commerce.offer_media
        set is_main = true
        where id = (
            select id from commerce.offer_media
            where offer_id = p_offer_id
            order by sort_order, id limit 1
        );
    end if;
    return jsonb_build_object(
        'media_id', p_media_id,
        'detached_at', v_detached_at
    );
end;
$$;

revoke execute on function commerce.remove_offer_media(bigint, bigint, text)
from public, anon, authenticated;
grant execute on function commerce.remove_offer_media(bigint, bigint, text)
to service_role;
