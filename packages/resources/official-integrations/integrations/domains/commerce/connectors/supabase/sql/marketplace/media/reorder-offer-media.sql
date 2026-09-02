

create or replace function commerce.reorder_offer_media(
    p_offer_id bigint,
    p_media_ids jsonb,
    p_cms_user_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_count integer;
begin
    perform offer.id
    from commerce.offers offer
    join commerce.sellers seller on seller.id = offer.seller_id
    where offer.id = p_offer_id
      and (p_cms_user_id is null or seller.cms_user_id = p_cms_user_id)
    for update of offer;
    if not found then raise exception 'not_found: offer'; end if;
    if jsonb_typeof(p_media_ids) <> 'array' or exists (
        select 1 from jsonb_array_elements(p_media_ids) item
        where (item #>> '{}') !~ '^[1-9][0-9]{0,17}$'
    ) then raise exception 'validation: mediaIds must be an array of positive ids'; end if;
    perform id from commerce.offer_media where offer_id = p_offer_id order by id for update;
    select count(*) into v_count from commerce.offer_media where offer_id = p_offer_id;
    if jsonb_array_length(p_media_ids) <> v_count
        or (select count(distinct item #>> '{}') from jsonb_array_elements(p_media_ids) item) <> v_count
        or exists (
            select 1 from jsonb_array_elements_text(p_media_ids) item
            where not exists (
                select 1 from commerce.offer_media
                where offer_id = p_offer_id and media_id = item::bigint
            )
        ) then raise exception 'validation: mediaIds must contain every offer image exactly once'; end if;

    update commerce.offer_media set is_main = false where offer_id = p_offer_id;
    update commerce.offer_media link
    set sort_order = ordered.position - 1,
        is_main = ordered.position = 1
    from jsonb_array_elements_text(p_media_ids) with ordinality ordered(media_id, position)
    where link.offer_id = p_offer_id and link.media_id = ordered.media_id::bigint;
    return jsonb_build_object('media_ids', p_media_ids);
end;
$$;