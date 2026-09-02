

create or replace function commerce.upsert_cart_item(
    p_buyer_cms_user_id text,
    p_offer_id bigint,
    p_quantity integer,
    p_expected_version integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_cart commerce.carts%rowtype;
    v_offer commerce.offers%rowtype;
    v_cart_exists boolean;
begin
    if p_buyer_cms_user_id is null or length(btrim(p_buyer_cms_user_id)) = 0 then
        raise exception 'forbidden: missing CMS user id';
    end if;
    if p_quantity is null or p_quantity not between 1 and 1000 then
        raise exception 'validation: quantity must be between 1 and 1000';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('commerce-cart:' || p_buyer_cms_user_id, 0));
    select * into v_cart from commerce.carts
    where buyer_cms_user_id = p_buyer_cms_user_id and status = 'open'
    for update;
    v_cart_exists := found;
    perform id from commerce.offers where id = p_offer_id for share;
    v_offer := commerce.assert_cart_offer_sellable(p_offer_id, p_quantity);
    if not v_cart_exists then
        if p_expected_version is not null and p_expected_version <> 0 then
            raise exception 'conflict: stale cart version';
        end if;
        insert into commerce.carts (buyer_cms_user_id, currency)
        values (p_buyer_cms_user_id, v_offer.currency)
        returning * into v_cart;
    else
        if p_expected_version is null then
            raise exception 'validation: expected cart version is required';
        end if;
        if v_cart.version is distinct from p_expected_version then
            raise exception 'conflict: stale cart version';
        end if;
        if v_cart.currency is not null and v_cart.currency <> v_offer.currency then
            raise exception 'conflict: one cart cannot contain multiple currencies';
        end if;
        if not exists (
            select 1 from commerce.cart_items where cart_id = v_cart.id and offer_id = p_offer_id
        ) and (select count(*) from commerce.cart_items where cart_id = v_cart.id) >= 100 then
            raise exception 'validation: a cart cannot contain more than 100 items';
        end if;
    end if;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) values (
        v_cart.id, v_offer.id, p_quantity,
        v_offer.accepted_price_amount, v_offer.version
    ) on conflict (cart_id, offer_id) do update set
        quantity = excluded.quantity,
        unit_amount_at_add = excluded.unit_amount_at_add,
        offer_version_at_add = excluded.offer_version_at_add;
    if v_cart_exists then
        update commerce.carts
        set currency = coalesce(currency, v_offer.currency)
        where id = v_cart.id;
    end if;
    return commerce.cart_payload(v_cart.id);
end;
$$;

create or replace function commerce.remove_cart_item(
    p_buyer_cms_user_id text,
    p_offer_id bigint,
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
    delete from commerce.cart_items where cart_id = v_cart.id and offer_id = p_offer_id;
    if not found then raise exception 'not_found: cart item'; end if;
    update commerce.carts
    set currency = case when exists (
        select 1 from commerce.cart_items where cart_id = v_cart.id
    ) then currency else null end
    where id = v_cart.id;
    return commerce.cart_payload(v_cart.id);
end;
$$;