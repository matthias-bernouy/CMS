create or replace function commerce.attach_product_media_v2(
    p_product_id bigint,
    p_storage_bucket text,
    p_storage_path text,
    p_mime_type text,
    p_file_size bigint,
    p_original_filename text,
    p_width integer,
    p_height integer,
    p_replace_media_id bigint default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_media commerce.media%rowtype;
    v_previous commerce.media%rowtype;
    v_link commerce.product_media%rowtype;
    v_settings commerce.settings%rowtype;
    v_position integer;
    v_is_main boolean;
begin
    perform id from commerce.products where id = p_product_id for update;
    if not found then raise exception 'not_found: product'; end if;
    select * into v_settings from commerce.settings where id = 'default' for share;

    if p_replace_media_id is null then
        if (
            select count(*) from commerce.product_media where product_id = p_product_id
        ) >= v_settings.product_image_max_count then
            raise exception 'validation: a product cannot have more than % images',
                v_settings.product_image_max_count;
        end if;
    else
        select * into v_link
        from commerce.product_media
        where product_id = p_product_id and media_id = p_replace_media_id
        for update;
        if not found then raise exception 'not_found: product image'; end if;
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
        from commerce.product_media
        where product_id = p_product_id;
        insert into commerce.product_media (product_id, media_id, sort_order, is_main)
        values (p_product_id, v_media.id, v_position, v_is_main)
        returning * into v_link;
    else
        update commerce.product_media set media_id = v_media.id where id = v_link.id
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
        'product_media_id', v_link.id,
        'media_id', v_media.id,
        'sort_order', v_link.sort_order,
        'is_main', v_link.is_main
    );
end;
$$;

create or replace function commerce.attach_product_media(
    p_product_id bigint,
    p_storage_bucket text,
    p_storage_path text,
    p_mime_type text,
    p_file_size bigint,
    p_original_filename text,
    p_replace_media_id bigint default null
)
returns jsonb
language sql
set search_path = ''
as $$
    select commerce.attach_product_media_v2(
        p_product_id, p_storage_bucket, p_storage_path, p_mime_type,
        p_file_size, p_original_filename, null, null, p_replace_media_id
    );
$$;

revoke execute on function commerce.attach_product_media_v2(
    bigint, text, text, text, bigint, text, integer, integer, bigint
) from public, anon, authenticated;
revoke execute on function commerce.attach_product_media(
    bigint, text, text, text, bigint, text, bigint
) from public, anon, authenticated;
grant execute on function commerce.attach_product_media_v2(
    bigint, text, text, text, bigint, text, integer, integer, bigint
) to service_role;
grant execute on function commerce.attach_product_media(
    bigint, text, text, text, bigint, text, bigint
) to service_role;
