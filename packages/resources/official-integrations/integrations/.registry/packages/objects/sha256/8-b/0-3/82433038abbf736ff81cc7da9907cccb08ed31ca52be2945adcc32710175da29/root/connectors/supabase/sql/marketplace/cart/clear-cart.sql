

create or replace function commerce.clear_cart(
    p_buyer_cms_user_id text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_cart commerce.carts%rowtype;
begin
    select * into v_cart from commerce.carts
    where buyer_cms_user_id = p_buyer_cms_user_id and status = 'open' for update;
    if not found then raise exception 'not_found: cart'; end if;
    if p_expected_version is null or v_cart.version is distinct from p_expected_version then
        raise exception 'conflict: stale cart version';
    end if;
    delete from commerce.cart_items where cart_id = v_cart.id;
    update commerce.carts set currency = null where id = v_cart.id;
    return commerce.cart_payload(v_cart.id);
end;
$$;