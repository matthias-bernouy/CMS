

create or replace function commerce.attach_offer_media(
    p_offer_id bigint,
    p_storage_bucket text,
    p_storage_path text,
    p_mime_type text,
    p_file_size bigint,
    p_original_filename text,
    p_replace_media_id bigint default null,
    p_cms_user_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_media commerce.media%rowtype;
    v_previous commerce.media%rowtype;
    v_link commerce.offer_media%rowtype;
    v_settings commerce.settings%rowtype;
    v_position integer;
    v_is_main boolean;
begin
    perform offer.id
    from commerce.offers offer
    join commerce.sellers seller on seller.id = offer.seller_id
    where offer.id = p_offer_id
      and (p_cms_user_id is null or seller.cms_user_id = p_cms_user_id)
    for update of offer;
    if not found then raise exception 'not_found: offer'; end if;
    select * into v_settings from commerce.settings where id = 'default' for share;
    if p_replace_media_id is null and (
        select count(*) from commerce.offer_media where offer_id = p_offer_id
    ) >= v_settings.offer_image_max_count then
        raise exception 'validation: an offer cannot have more than % images', v_settings.offer_image_max_count;
    end if;

    insert into commerce.media (
        storage_bucket, storage_path, mime_type, file_size, original_filename
    ) values (
        p_storage_bucket, p_storage_path, lower(p_mime_type), p_file_size,
        coalesce(nullif(btrim(p_original_filename), ''), 'image')
    ) returning * into v_media;

    if p_replace_media_id is null then
        select coalesce(max(sort_order) + 1, 0), count(*) = 0
        into v_position, v_is_main
        from commerce.offer_media
        where offer_id = p_offer_id;
        insert into commerce.offer_media (offer_id, media_id, sort_order, is_main)
        values (p_offer_id, v_media.id, v_position, v_is_main)
        returning * into v_link;
    else
        select * into v_link
        from commerce.offer_media
        where offer_id = p_offer_id and media_id = p_replace_media_id
        for update;
        if not found then raise exception 'not_found: offer image'; end if;
        select * into v_previous from commerce.media where id = v_link.media_id for update;
        update commerce.offer_media set media_id = v_media.id where id = v_link.id
        returning * into v_link;
        delete from commerce.media where id = v_previous.id;
    end if;

    return to_jsonb(v_media) || jsonb_build_object(
        'offer_media_id', v_link.id,
        'media_id', v_media.id,
        'sort_order', v_link.sort_order,
        'is_main', v_link.is_main,
        'replaced_storage_bucket', v_previous.storage_bucket,
        'replaced_storage_path', v_previous.storage_path
    );
end;
$$;

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
    v_media commerce.media%rowtype;
    v_offer commerce.offers%rowtype;
    v_settings commerce.settings%rowtype;
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
        raise exception 'validation: a submitted offer must keep at least % images', v_settings.offer_image_min_count;
    end if;
    select * into v_link
    from commerce.offer_media
    where offer_id = p_offer_id and media_id = p_media_id
    for update;
    if not found then raise exception 'not_found: offer image'; end if;
    select * into v_media from commerce.media where id = v_link.media_id for update;
    delete from commerce.offer_media where id = v_link.id;
    delete from commerce.media where id = v_media.id;
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
        'media_id', v_media.id,
        'storage_bucket', v_media.storage_bucket,
        'storage_path', v_media.storage_path
    );
end;
$$;
