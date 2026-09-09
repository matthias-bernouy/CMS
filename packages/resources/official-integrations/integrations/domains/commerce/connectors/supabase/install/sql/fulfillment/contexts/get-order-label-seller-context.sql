

create or replace function commerce.get_order_label_seller_context(
    p_order_id bigint,
    p_seller_cms_user_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when nullif(pg_catalog.btrim(p_seller_cms_user_id), '') is null
            then jsonb_build_object('state', 'identity_required')
        else coalesce((
            select jsonb_build_object(
                'state', 'ok',
                'context', jsonb_build_object(
                    'public_id', order_row.public_id,
                    'allowed', order_row.status = 'active'
                        and fulfillment.status in (
                            'label_created', 'seller_handoff_declared'
                        )
                        and fulfillment.blocking_reason is null
                        and creation.status = 'succeeded'
                        and settlement.status = 'held'
                        and settlement.manual_review_reason is null
                        and not exists (
                            select 1
                            from commerce.order_cancellation_requests request
                            where request.order_id = order_row.id
                              and request.status not in (
                                  'rejected', 'completed'
                              )
                        )
                        and not exists (
                            select 1
                            from commerce.refund_requests request
                            where request.order_id = order_row.id
                              and request.status not in (
                                  'rejected', 'cancelled', 'failed'
                              )
                        ),
                    'seller_cms_user_id', seller.cms_user_id
                )
            )
            from commerce.orders order_row
            join commerce.sellers seller on seller.id = order_row.seller_id
            join commerce.order_fulfillments fulfillment
                on fulfillment.order_id = order_row.id
            join commerce.shipment_creation_operations creation
                on creation.order_id = order_row.id
            join commerce.order_settlements settlement
                on settlement.order_id = order_row.id
            where order_row.id = p_order_id
              and seller.cms_user_id
                  = nullif(pg_catalog.btrim(p_seller_cms_user_id), '')
        ), jsonb_build_object('state', 'not_found'))
    end;
$$;

revoke execute on function commerce.get_order_label_seller_context(
    bigint, text
) from public, anon, authenticated;
grant execute on function commerce.get_order_label_seller_context(
    bigint, text
) to service_role;

create or replace function commerce.get_order_shipping_actions_seller_context(
    p_order_id bigint,
    p_seller_cms_user_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_context record;
    v_creation_authorization jsonb;
    v_common_allowed boolean;
begin
    if nullif(pg_catalog.btrim(p_seller_cms_user_id), '') is null then
        return pg_catalog.jsonb_build_object('state', 'identity_required');
    end if;

    select
        order_row.id,
        order_row.public_id,
        order_row.order_number,
        order_row.status as order_status,
        seller.cms_user_id as seller_cms_user_id,
        fulfillment.status as fulfillment_status,
        fulfillment.blocking_reason,
        settlement.status as settlement_status,
        settlement.manual_review_reason,
        creation.status as creation_status
    into v_context
    from commerce.orders order_row
    join commerce.sellers seller on seller.id = order_row.seller_id
    join commerce.order_fulfillments fulfillment
        on fulfillment.order_id = order_row.id
    join commerce.order_settlements settlement
        on settlement.order_id = order_row.id
    left join commerce.shipment_creation_operations creation
        on creation.order_id = order_row.id
    where order_row.id = p_order_id
      and seller.cms_user_id
          = nullif(pg_catalog.btrim(p_seller_cms_user_id), '');

    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;

    v_creation_authorization := commerce.get_order_fulfillment_authorization(
        v_context.public_id
    );
    v_common_allowed := v_context.order_status = 'active'
        and v_context.creation_status = 'succeeded'
        and v_context.settlement_status = 'held'
        and v_context.blocking_reason is null
        and v_context.manual_review_reason is null
        and not exists (
            select 1
            from commerce.order_cancellation_requests request
            where request.order_id = v_context.id
              and request.status not in ('rejected', 'completed')
        )
        and not exists (
            select 1
            from commerce.refund_requests request
            where request.order_id = v_context.id
              and request.status not in ('rejected', 'cancelled', 'failed')
        );

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'context', pg_catalog.jsonb_build_object(
            'id', v_context.id,
            'public_id', v_context.public_id,
            'order_number', v_context.order_number,
            'seller_cms_user_id', v_context.seller_cms_user_id,
            'order_status', v_context.order_status,
            'fulfillment_status', v_context.fulfillment_status,
            'settlement_status', v_context.settlement_status,
            'blocking_reason', v_context.blocking_reason,
            'review_reason', coalesce(
                v_context.blocking_reason,
                v_context.manual_review_reason
            ),
            'can_create_shipment', coalesce(
                (v_creation_authorization->>'allowed')::boolean,
                false
            ),
            'can_download_label', v_common_allowed
                and v_context.fulfillment_status in (
                    'label_created', 'seller_handoff_declared'
                ),
            'can_declare_handoff', v_common_allowed
                and v_context.fulfillment_status = 'label_created',
            'requires_review', v_context.fulfillment_status = 'manual_review'
                or v_context.settlement_status = 'manual_review'
                or v_context.blocking_reason is not null
                or v_context.manual_review_reason is not null
        )
    );
end;
$$;

revoke execute on function commerce.get_order_shipping_actions_seller_context(
    bigint, text
) from public, anon, authenticated;
grant execute on function commerce.get_order_shipping_actions_seller_context(
    bigint, text
) to service_role;
