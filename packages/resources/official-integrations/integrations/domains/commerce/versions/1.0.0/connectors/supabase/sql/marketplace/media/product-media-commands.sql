

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
language plpgsql
set search_path = ''
as $$
declare
    v_media commerce.media%rowtype;
    v_previous commerce.media%rowtype;
    v_link commerce.product_media%rowtype;
    v_position integer;
    v_is_main boolean;
begin
    perform id from commerce.products where id = p_product_id for update;
    if not found then raise exception 'not_found: product'; end if;

    insert into commerce.media (
        storage_bucket, storage_path, mime_type, file_size, original_filename
    ) values (
        p_storage_bucket, p_storage_path, lower(p_mime_type), p_file_size,
        coalesce(nullif(btrim(p_original_filename), ''), 'image')
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
        select * into v_link
        from commerce.product_media
        where product_id = p_product_id and media_id = p_replace_media_id
        for update;
        if not found then raise exception 'not_found: product image'; end if;
        select * into v_previous from commerce.media where id = v_link.media_id for update;
        update commerce.product_media set media_id = v_media.id where id = v_link.id
        returning * into v_link;
        delete from commerce.media where id = v_previous.id;
    end if;

    return to_jsonb(v_media) || jsonb_build_object(
        'product_media_id', v_link.id,
        'media_id', v_media.id,
        'sort_order', v_link.sort_order,
        'is_main', v_link.is_main,
        'replaced_storage_bucket', v_previous.storage_bucket,
        'replaced_storage_path', v_previous.storage_path
    );
end;
$$;

create or replace function commerce.remove_product_media(
    p_product_id bigint,
    p_media_id bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_link commerce.product_media%rowtype;
    v_media commerce.media%rowtype;
begin
    perform id from commerce.products where id = p_product_id for update;
    if not found then raise exception 'not_found: product'; end if;
    select * into v_link
    from commerce.product_media
    where product_id = p_product_id and media_id = p_media_id
    for update;
    if not found then raise exception 'not_found: product image'; end if;
    select * into v_media from commerce.media where id = v_link.media_id for update;
    delete from commerce.product_media where id = v_link.id;
    delete from commerce.media where id = v_media.id;
    if v_link.is_main then
        update commerce.product_media
        set is_main = true
        where id = (
            select id from commerce.product_media
            where product_id = p_product_id
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

create or replace function commerce.reorder_product_media(
    p_product_id bigint,
    p_media_ids jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_count integer;
begin
    perform id from commerce.products where id = p_product_id for update;
    if not found then raise exception 'not_found: product'; end if;
    if jsonb_typeof(p_media_ids) <> 'array' or exists (
        select 1 from jsonb_array_elements(p_media_ids) item
        where (item #>> '{}') !~ '^[1-9][0-9]{0,17}$'
    ) then raise exception 'validation: mediaIds must be an array of positive ids'; end if;
    perform id from commerce.product_media
    where product_id = p_product_id order by id for update;
    select count(*) into v_count from commerce.product_media where product_id = p_product_id;
    if jsonb_array_length(p_media_ids) <> v_count
        or (select count(distinct item #>> '{}') from jsonb_array_elements(p_media_ids) item) <> v_count
        or exists (
            select 1 from jsonb_array_elements_text(p_media_ids) item
            where not exists (
                select 1 from commerce.product_media
                where product_id = p_product_id and media_id = item::bigint
            )
        ) then raise exception 'validation: mediaIds must contain every product image exactly once'; end if;

    update commerce.product_media set is_main = false where product_id = p_product_id;
    update commerce.product_media link
    set sort_order = ordered.position - 1,
        is_main = ordered.position = 1
    from jsonb_array_elements_text(p_media_ids) with ordinality ordered(media_id, position)
    where link.product_id = p_product_id and link.media_id = ordered.media_id::bigint;
    return jsonb_build_object('media_ids', p_media_ids);
end;
$$;