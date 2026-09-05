create or replace function commerce.authorize_product_media_upload(
    p_product_id bigint,
    p_replace_media_id bigint default null
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
    if not exists (select 1 from commerce.products where id = p_product_id) then
        raise exception 'not_found: product';
    end if;
    if p_replace_media_id is not null and not exists (
        select 1 from commerce.product_media
        where product_id = p_product_id and media_id = p_replace_media_id
    ) then
        raise exception 'not_found: product image';
    end if;
    if p_replace_media_id is null then
        select product_image_max_count into v_max_count
        from commerce.settings where id = 'default';
        if (select count(*) from commerce.product_media where product_id = p_product_id) >= v_max_count then
            raise exception 'validation: a product cannot have more than % images', v_max_count;
        end if;
    end if;
    return jsonb_build_object(
        'state', 'authorized',
        'product_id', p_product_id,
        'replace_media_id', p_replace_media_id
    );
end;
$$;

revoke execute on function commerce.authorize_product_media_upload(bigint, bigint)
from public, anon, authenticated;
grant execute on function commerce.authorize_product_media_upload(bigint, bigint)
to service_role;
