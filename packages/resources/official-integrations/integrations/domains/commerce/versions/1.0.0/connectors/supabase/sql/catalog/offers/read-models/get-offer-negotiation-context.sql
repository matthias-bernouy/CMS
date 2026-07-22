

create or replace function commerce.get_offer_negotiation_context(
    p_offer_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce((
        select case
            when seller.id is null then jsonb_build_object('state', 'seller_not_found')
            else jsonb_build_object(
                'state', 'ok',
                'context', jsonb_build_object(
                    'offer_id', offer.id,
                    'offer_slug', offer.slug,
                    'offer_title', offer.title,
                    'seller_cms_user_id', seller.cms_user_id,
                    'seller_display_name', seller.display_name,
                    'reference_amount', offer.accepted_price_amount,
                    'currency', offer.currency,
                    'publication_status', offer.publication_status,
                    'availability', offer.availability
                )
            )
        end
        from commerce.offers offer
        left join commerce.sellers seller on seller.id = offer.seller_id
        where offer.id = p_offer_id
    ), jsonb_build_object('state', 'not_found'));
$$;

revoke execute on function commerce.get_offer_negotiation_context(bigint)
    from public, anon, authenticated;
grant execute on function commerce.get_offer_negotiation_context(bigint)
    to service_role;