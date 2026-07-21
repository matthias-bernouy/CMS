create function pg_temp.assert_seller_label_context(
    p_order_id bigint,
    p_order_public_id uuid,
    p_actor text,
    p_expected boolean,
    p_message text
) returns void
language plpgsql
set search_path = ''
as $assert$
declare
    context jsonb := commerce.get_order_label_seller_context(
        p_order_id, p_actor
    );
    authorization_result jsonb := commerce.get_order_label_authorization(
        p_order_public_id, p_actor
    );
begin
    if context is distinct from pg_catalog.jsonb_build_object(
        'state', 'ok',
        'context', pg_catalog.jsonb_build_object(
            'public_id', p_order_public_id,
            'allowed', p_expected,
            'seller_cms_user_id', p_actor
        )
    ) or context #>> '{context,allowed}'
        is distinct from (authorization_result->>'allowed') then
        raise exception 'seller label context: %: %', p_message, context;
    end if;
end;
$assert$;
