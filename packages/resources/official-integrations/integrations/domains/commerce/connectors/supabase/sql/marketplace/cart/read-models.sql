

create or replace function commerce.cart_payload(p_cart_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
with selected_cart as (
    select * from commerce.carts where id = p_cart_id
), details as (
    select
        item.*, offer.accepted_price_amount as current_unit_amount,
        offer.currency, offer.availability, offer.quantity_available,
        offer.title, offer.seller_id, seller.slug as seller_slug,
        seller.display_name as seller_name,
        product.id as product_id, product.slug as product_slug,
        product.title as product_title,
        variant.id as variant_id, variant.sku as variant_sku,
        variant.title as variant_title,
        array_remove(array[
            case when offer.publication_status <> 'active'
                or state.phase <> 'ready' or not state.enabled
                or offer.accepted_price_amount is null
                or offer.availability = 'unavailable' then 'offer_unavailable' end,
            case when offer.accepted_price_amount is distinct from item.unit_amount_at_add
                then 'price_changed' end,
            case when offer.quantity_available is not null
                and offer.quantity_available < item.quantity then 'insufficient_stock' end,
            case when seller.verification_status in ('rejected', 'suspended')
                or (settings.require_verified_seller and seller.verification_status <> 'verified')
                then 'seller_unavailable' end,
            case when product.status <> 'active' or product.visibility <> 'public'
                then 'product_unavailable' end,
            case when cart.currency is distinct from offer.currency then 'currency_mismatch' end
        ], null)::text[] as issues
    from selected_cart cart
    join commerce.cart_items item on item.cart_id = cart.id
    join commerce.offers offer on offer.id = item.offer_id
    join commerce.products product on product.id = offer.product_id
    left join commerce.product_variants variant on variant.id = offer.variant_id
    join commerce.sellers seller on seller.id = offer.seller_id
    join commerce.offer_workflow_states state on state.code = offer.workflow_state
    join commerce.settings settings on settings.id = 'default'
)
select coalesce((
    select jsonb_build_object(
        'exists', true,
        'id', cart.id,
        'public_id', cart.public_id,
        'buyer_cms_user_id', cart.buyer_cms_user_id,
        'status', cart.status,
        'currency', cart.currency,
        'version', cart.version,
        'subtotal_amount', coalesce((
            select sum(coalesce(current_unit_amount, 0) * quantity) from details
        ), 0),
        'items', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', id,
                'offer_id', offer_id,
                'quantity', quantity,
                'unit_amount_at_add', unit_amount_at_add,
                'offer_version_at_add', offer_version_at_add,
                'current_unit_amount', current_unit_amount,
                'currency', currency,
                'availability', availability,
                'quantity_available', quantity_available,
                'title', title,
                'issues', to_jsonb(issues),
                'seller', jsonb_build_object(
                    'id', seller_id, 'slug', seller_slug, 'display_name', seller_name
                ),
                'product', jsonb_build_object(
                    'id', product_id, 'slug', product_slug, 'title', product_title
                ),
                'variant', case when variant_id is null then null else jsonb_build_object(
                    'id', variant_id, 'sku', variant_sku, 'title', variant_title
                ) end
            ) order by id) from details
        ), '[]'::jsonb),
        'seller_groups', coalesce((
            select jsonb_agg(jsonb_build_object(
                'seller', jsonb_build_object(
                    'id', seller_id, 'slug', seller_slug, 'display_name', seller_name
                ),
                'currency', currency,
                'subtotal_amount', subtotal_amount,
                'item_ids', item_ids,
                'issues', issues
            ) order by seller_id)
            from (
                select
                    seller_id, min(seller_slug) as seller_slug,
                    min(seller_name) as seller_name, min(currency) as currency,
                    sum(coalesce(current_unit_amount, 0) * quantity) as subtotal_amount,
                    jsonb_agg(id order by id) as item_ids,
                    to_jsonb(array(
                        select distinct issue
                        from details issue_detail,
                        unnest(issue_detail.issues) issue
                        where issue_detail.seller_id = grouped.seller_id
                        order by issue
                    )) as issues
                from details grouped
                group by seller_id
            ) grouped_sellers
        ), '[]'::jsonb),
        'issues', to_jsonb(array(
            select distinct issue from details, unnest(issues) issue order by issue
        )),
        'created_at', cart.created_at,
        'updated_at', cart.updated_at
    )
    from selected_cart cart
), jsonb_build_object(
    'exists', false,
    'subtotal_amount', 0,
    'items', '[]'::jsonb,
    'seller_groups', '[]'::jsonb,
    'issues', '[]'::jsonb
));
$$;

create or replace function commerce.get_cart(p_buyer_cms_user_id text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare v_cart_id bigint;
begin
    if p_buyer_cms_user_id is null or length(btrim(p_buyer_cms_user_id)) = 0 then
        raise exception 'forbidden: missing CMS user id';
    end if;
    select id into v_cart_id from commerce.carts
    where buyer_cms_user_id = p_buyer_cms_user_id and status = 'open';
    return commerce.cart_payload(v_cart_id);
end;
$$;