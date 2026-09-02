

create or replace function commerce.review_seller(
    p_seller_id bigint,
    p_status text,
    p_admin_id text,
    p_reason text default null,
    p_expected_version integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_seller commerce.sellers%rowtype;
    v_settings commerce.settings%rowtype;
    v_previous text;
begin
    if p_status not in ('pending', 'verified', 'rejected', 'suspended') then
        raise exception 'validation: unsupported seller status';
    end if;
    select * into v_settings from commerce.settings where id = 'default' for share;
    select * into v_seller from commerce.sellers where id = p_seller_id for update;
    if not found then raise exception 'not_found: seller'; end if;
    if p_expected_version is null then raise exception 'validation: expected seller version is required'; end if;
    if v_seller.version is distinct from p_expected_version then
        raise exception 'conflict: stale seller version';
    end if;
    perform id from commerce.offers
    where seller_id = v_seller.id
    order by id
    for update;
    v_previous := v_seller.verification_status;

    update commerce.sellers
    set verification_status = p_status,
        verified_at = case when p_status = 'verified' then now() else null end,
        verified_by = case when p_status = 'verified' then coalesce(nullif(p_admin_id, ''), 'cms-admin') else null end
    where id = p_seller_id
    returning * into v_seller;

    insert into commerce.seller_verification_events (
        seller_id, previous_status, next_status, actor_id, reason
    ) values (
        v_seller.id, v_previous, p_status, coalesce(nullif(p_admin_id, ''), 'cms-admin'), p_reason
    );
    if p_status in ('rejected', 'suspended')
        or (v_settings.mode = 'ecommerce' and v_seller.kind = 'user') then
        update commerce.offers
        set publication_status = 'paused'
        where seller_id = v_seller.id and publication_status = 'active';
    end if;
    return to_jsonb(v_seller);
end;
$$;