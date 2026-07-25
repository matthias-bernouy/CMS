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
    v_product commerce.products%rowtype;
    v_settings commerce.settings%rowtype;
    v_detached_at timestamptz;
begin
    select * into v_product from commerce.products where id = p_product_id for update;
    if not found then raise exception 'not_found: product'; end if;
    select * into v_settings from commerce.settings where id = 'default' for share;
    if v_product.status = 'active' and v_product.visibility = 'public' and (
        select count(*) from commerce.product_media where product_id = p_product_id
    ) <= v_settings.product_image_min_count then
        raise exception 'validation: an active public product must keep at least % images',
            v_settings.product_image_min_count;
    end if;
    select * into v_link
    from commerce.product_media
    where product_id = p_product_id and media_id = p_media_id
    for update;
    if not found then raise exception 'not_found: product image'; end if;
    perform 1 from commerce.media where id = p_media_id for update;
    delete from commerce.product_media where id = v_link.id;
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
        update commerce.product_media
        set is_main = true
        where id = (
            select id from commerce.product_media
            where product_id = p_product_id
            order by sort_order, id limit 1
        );
    end if;
    return jsonb_build_object(
        'media_id', p_media_id,
        'detached_at', v_detached_at
    );
end;
$$;

create or replace function commerce.get_product_media_download_context(
    p_media_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce((
        select jsonb_build_object(
            'state', 'ok',
            'media', jsonb_build_object(
                'id', media.id,
                'storage_bucket', media.storage_bucket,
                'storage_path', media.storage_path,
                'mime_type', media.mime_type,
                'width', media.width,
                'height', media.height
            )
        )
        from commerce.media media
        where media.id = p_media_id
          and media.detached_at is null
          and exists (
              select 1 from commerce.product_media link
              where link.media_id = media.id
          )
    ), jsonb_build_object('state', 'not_found'));
$$;

revoke execute on function commerce.get_product_media_download_context(bigint)
from public, anon, authenticated;
grant execute on function commerce.get_product_media_download_context(bigint)
to service_role;

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
        ) then
        raise exception 'validation: mediaIds must contain every product image exactly once';
    end if;

    update commerce.product_media set is_main = false where product_id = p_product_id;
    update commerce.product_media link
    set sort_order = ordered.position - 1,
        is_main = ordered.position = 1
    from jsonb_array_elements_text(p_media_ids) with ordinality ordered(media_id, position)
    where link.product_id = p_product_id and link.media_id = ordered.media_id::bigint;
    return jsonb_build_object('media_ids', p_media_ids);
end;
$$;

revoke execute on function commerce.remove_product_media(bigint, bigint)
from public, anon, authenticated;
revoke execute on function commerce.reorder_product_media(bigint, jsonb)
from public, anon, authenticated;
grant execute on function commerce.remove_product_media(bigint, bigint)
to service_role;
grant execute on function commerce.reorder_product_media(bigint, jsonb)
to service_role;
