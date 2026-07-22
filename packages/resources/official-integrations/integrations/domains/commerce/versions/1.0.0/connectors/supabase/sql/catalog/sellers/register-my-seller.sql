

create or replace function commerce.register_my_seller(
    p_cms_user_id text,
    p_display_name text,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_seller commerce.sellers%rowtype;
    v_slug text;
begin
    if p_cms_user_id is null or length(btrim(p_cms_user_id)) = 0 then
        raise exception 'forbidden: missing CMS user id';
    end if;
    select * into v_settings from commerce.settings where id = 'default' for share;
    if v_settings.mode = 'ecommerce' then
        raise exception 'forbidden: marketplace sellers are disabled';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('commerce-seller:' || p_cms_user_id, 0));
    select * into v_seller from commerce.sellers where cms_user_id = p_cms_user_id;
    if found then
        return to_jsonb(v_seller);
    end if;
    perform commerce.assert_custom_fields('seller', coalesce(p_metadata, '{}'::jsonb), 'self');

    v_slug := 'user-' || substr(md5(p_cms_user_id), 1, 16);
    insert into commerce.sellers (kind, cms_user_id, slug, display_name, metadata)
    values (
        'user',
        p_cms_user_id,
        v_slug,
        coalesce(nullif(btrim(p_display_name), ''), 'Marketplace seller'),
        coalesce(p_metadata, '{}'::jsonb)
    )
    returning * into v_seller;

    insert into commerce.seller_verification_events (
        seller_id, previous_status, next_status, actor_id, data
    ) values (v_seller.id, null, 'pending', p_cms_user_id, '{}'::jsonb);

    return to_jsonb(v_seller);
end;
$$;