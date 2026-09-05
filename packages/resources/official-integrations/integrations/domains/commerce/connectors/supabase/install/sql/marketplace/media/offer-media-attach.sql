create or replace function commerce.attach_offer_media_v2(
    p_offer_id bigint,
    p_storage_bucket text,
    p_storage_path text,
    p_mime_type text,
    p_file_size bigint,
    p_original_filename text,
    p_width integer,
    p_height integer,
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

    if p_replace_media_id is null then
        if (
            select count(*) from commerce.offer_media where offer_id = p_offer_id
        ) >= v_settings.offer_image_max_count then
            raise exception 'validation: an offer cannot have more than % images',
                v_settings.offer_image_max_count;
        end if;
    else
        select * into v_link
        from commerce.offer_media
        where offer_id = p_offer_id and media_id = p_replace_media_id
        for update;
        if not found then raise exception 'not_found: offer image'; end if;
        select * into v_previous from commerce.media where id = v_link.media_id for update;
    end if;

    insert into commerce.media (
        storage_bucket, storage_path, mime_type, file_size,
        original_filename, width, height
    ) values (
        p_storage_bucket, p_storage_path, lower(p_mime_type), p_file_size,
        coalesce(nullif(btrim(p_original_filename), ''), 'image'), p_width, p_height
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
        update commerce.offer_media set media_id = v_media.id where id = v_link.id
        returning * into v_link;
        if not exists (
            select 1 from commerce.product_media where media_id = v_previous.id
        ) and not exists (
            select 1 from commerce.offer_media where media_id = v_previous.id
        ) then
            update commerce.media
            set detached_at = coalesce(detached_at, now())
            where id = v_previous.id;
        end if;
    end if;

    return to_jsonb(v_media) || jsonb_build_object(
        'offer_media_id', v_link.id,
        'media_id', v_media.id,
        'sort_order', v_link.sort_order,
        'is_main', v_link.is_main
    );
end;
$$;

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
language sql
set search_path = ''
as $$
    select commerce.attach_offer_media_v2(
        p_offer_id, p_storage_bucket, p_storage_path, p_mime_type,
        p_file_size, p_original_filename, null, null,
        p_replace_media_id, p_cms_user_id
    );
$$;

revoke execute on function commerce.attach_offer_media_v2(
    bigint, text, text, text, bigint, text, integer, integer, bigint, text
) from public, anon, authenticated;
revoke execute on function commerce.attach_offer_media(
    bigint, text, text, text, bigint, text, bigint, text
) from public, anon, authenticated;
grant execute on function commerce.attach_offer_media_v2(
    bigint, text, text, text, bigint, text, integer, integer, bigint, text
) to service_role;
grant execute on function commerce.attach_offer_media(
    bigint, text, text, text, bigint, text, bigint, text
) to service_role;
