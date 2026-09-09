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

create function pg_temp.assert_seller_shipping_actions(
    p_order_id bigint,
    p_actor text,
    p_can_download_label boolean,
    p_can_declare_handoff boolean,
    p_requires_review boolean,
    p_message text
) returns void
language plpgsql
set search_path = ''
as $assert$
declare
    context jsonb := commerce.get_order_shipping_actions_seller_context(
        p_order_id, p_actor
    );
begin
    if context->>'state' <> 'ok'
       or (context #>> '{context,can_download_label}')::boolean
            is distinct from p_can_download_label
       or (context #>> '{context,can_declare_handoff}')::boolean
            is distinct from p_can_declare_handoff
       or (context #>> '{context,requires_review}')::boolean
            is distinct from p_requires_review then
        raise exception 'seller shipping actions: %: %', p_message, context;
    end if;
end;
$assert$;

create function pg_temp.assert_shipment_creation_seller_context(
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
    context jsonb := commerce.get_order_shipment_creation_seller_context(
        p_order_id, p_actor
    );
    authorization_result jsonb := commerce.get_order_fulfillment_authorization(
        p_order_public_id
    );
begin
    if context is distinct from pg_catalog.jsonb_build_object(
        'state', 'ok',
        'context', pg_catalog.jsonb_build_object(
            'id', p_order_id,
            'public_id', p_order_public_id,
            'allowed', p_expected,
            'seller_cms_user_id', p_actor
        )
    ) or context #>> '{context,allowed}'
        is distinct from authorization_result->>'allowed' then
        raise exception 'seller shipment creation context: %: %',
            p_message, context;
    end if;
end;
$assert$;
