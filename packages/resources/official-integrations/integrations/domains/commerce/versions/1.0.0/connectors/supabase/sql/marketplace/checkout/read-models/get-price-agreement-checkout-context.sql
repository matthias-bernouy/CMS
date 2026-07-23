create or replace function commerce.get_price_agreement_checkout_context(
    p_buyer_cms_user_id text,
    p_agreement_public_id uuid
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
            'context', jsonb_build_object(
                'agreement_id', agreement.public_id,
                'agreement_version', agreement.authority_version,
                'status', case
                    when agreement.status = 'active' and agreement.expires_at <= now() then 'expired'
                    else agreement.status
                end,
                'expires_at', agreement.expires_at,
                'consumed_at', agreement.consumed_at,
                'offer', jsonb_build_object(
                    'id', offer.id,
                    'slug', offer.slug,
                    'title', offer.title,
                    'main_image_media_id', (
                        select link.media_id
                        from commerce.offer_media link
                        where link.offer_id = offer.id
                        order by link.is_main desc, link.sort_order, link.id
                        limit 1
                    )
                ),
                'seller', jsonb_build_object(
                    'display_name', seller.display_name
                ),
                'unit_amount', agreement.unit_amount,
                'quantity', agreement.quantity,
                'subtotal_amount', agreement.unit_amount::numeric * agreement.quantity,
                'currency', agreement.currency,
                'order_id', order_row.public_id
            )
        )
        from commerce.price_agreements agreement
        join commerce.offers offer on offer.id = agreement.offer_id
        join commerce.sellers seller on seller.id = agreement.seller_id
        left join commerce.orders order_row on order_row.id = agreement.order_id
        where agreement.public_id = p_agreement_public_id
          and agreement.buyer_cms_user_id = p_buyer_cms_user_id
        limit 1
    ), jsonb_build_object('state', 'not_found'));
$$;

revoke execute on function commerce.get_price_agreement_checkout_context(text, uuid)
    from public, anon, authenticated;
grant execute on function commerce.get_price_agreement_checkout_context(text, uuid)
    to service_role;
