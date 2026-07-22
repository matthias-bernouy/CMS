

create or replace function commerce.update_my_seller(
    p_cms_user_id text,
    p_expected_version integer,
    p_display_name text default null,
    p_metadata_patch jsonb default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_seller commerce.sellers%rowtype;
    v_metadata jsonb;
begin
    select * into v_settings from commerce.settings where id = 'default' for share;
    if v_settings.mode = 'ecommerce' then raise exception 'forbidden: marketplace sellers are disabled'; end if;
    select * into v_seller from commerce.sellers where cms_user_id = p_cms_user_id for update;
    if not found then raise exception 'not_found: seller'; end if;
    if v_seller.version is distinct from p_expected_version then
        raise exception 'conflict: stale seller version';
    end if;
    if p_metadata_patch is not null then
        perform commerce.assert_custom_field_patch('seller', p_metadata_patch, 'self');
        v_metadata := v_seller.metadata || p_metadata_patch;
    else
        v_metadata := v_seller.metadata;
    end if;
    perform commerce.assert_custom_fields('seller', v_metadata, 'system');
    update commerce.sellers
    set display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
        metadata = v_metadata
    where id = v_seller.id
    returning * into v_seller;
    return to_jsonb(v_seller);
end;
$$;