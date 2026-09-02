

create or replace function commerce.get_claim_return_authorization_context(
    p_claim_id bigint
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
            'claim', jsonb_build_object(
                'id', claim.id,
                'public_id', claim.public_id,
                'buyer_cms_user_id', claim.buyer_cms_user_id,
                'status', claim.status,
                'resolution_outcome', claim.resolution_outcome,
                'return_ship_by_at', claim.return_ship_by_at,
                'return_delivery_status', claim.return_delivery_status,
                'return_recipient_handoff_at', claim.return_recipient_handoff_at,
                'version', claim.version
            ),
            'order', case when orders.id is null then null else jsonb_build_object(
                'id', orders.id,
                'public_id', orders.public_id,
                'order_number', orders.order_number
            ) end,
            'seller', case when seller.id is null then null else jsonb_build_object(
                'id', seller.id,
                'cms_user_id', seller.cms_user_id
            ) end,
            'financial_terms', case when terms.order_id is null then null
                else jsonb_build_object(
                    'delivery_quote_id', terms.delivery_quote_id,
                    'merchandise_subtotal_amount', terms.merchandise_subtotal_amount,
                    'currency', terms.currency
                )
            end
        )
        from commerce.marketplace_claims claim
        left join commerce.orders orders on orders.id = claim.order_id
        left join commerce.sellers seller on seller.id = claim.seller_id
        left join commerce.order_financial_terms terms on terms.order_id = claim.order_id
        where claim.id = p_claim_id
    ), jsonb_build_object('state', 'not_found'));
$$;

revoke execute on function commerce.get_claim_return_authorization_context(bigint)
from public, anon, authenticated;
grant execute on function commerce.get_claim_return_authorization_context(bigint)
to service_role;