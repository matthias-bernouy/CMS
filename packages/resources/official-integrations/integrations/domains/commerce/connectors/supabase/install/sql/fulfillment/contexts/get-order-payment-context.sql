

create or replace function commerce.get_order_payment_context(
    p_order_id bigint,
    p_buyer_cms_user_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when nullif(btrim(p_buyer_cms_user_id), '') is null
            then jsonb_build_object('state', 'identity_required')
        else coalesce((
            select jsonb_build_object(
                'state', 'ok',
                'context', jsonb_build_object(
                    'id', order_row.id,
                    'public_id', order_row.public_id,
                    'buyer_cms_user_id', order_row.buyer_cms_user_id
                )
            )
            from commerce.orders order_row
            where order_row.id = p_order_id
              and order_row.buyer_cms_user_id
                  = nullif(btrim(p_buyer_cms_user_id), '')
        ), jsonb_build_object('state', 'not_found'))
    end;
$$;

revoke execute on function commerce.get_order_payment_context(bigint, text)
    from public, anon, authenticated;
grant execute on function commerce.get_order_payment_context(bigint, text)
    to service_role;