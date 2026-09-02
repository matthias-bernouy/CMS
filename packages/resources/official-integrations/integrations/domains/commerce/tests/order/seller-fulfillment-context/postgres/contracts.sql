do $contract$
declare
    actor constant text := 'order-read-seller-17';
    target_order_id bigint := (
        select id from commerce.orders
        where public_id = '00000000-0000-4000-8000-000000000042'
    );
    empty_order_id bigint := (
        select id from commerce.orders
        where public_id = '00000000-0000-4000-8000-000000000041'
    );
    order_public_id constant uuid :=
        '00000000-0000-4000-8000-000000000042';
    fulfillment jsonb;
begin
    fulfillment := commerce.get_order_fulfillment_seller_context(
        target_order_id, actor
    );
    if fulfillment is distinct from jsonb_build_object(
        'state', 'ok',
        'context', jsonb_build_object(
            'id', target_order_id,
            'public_id', order_public_id,
            'order_number', 'ORDER-READ-42'
        )
    ) then
        raise exception 'seller fulfillment context: projection changed: %',
            fulfillment;
    end if;

    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, true,
        'initial projection changed'
    );

    if commerce.get_order_fulfillment_seller_context(
        target_order_id, '  ' || actor || '  '
    ) is distinct from fulfillment
       or commerce.get_order_label_seller_context(
           target_order_id, '  ' || actor || '  '
       ) is distinct from commerce.get_order_label_seller_context(
           target_order_id, actor
       ) then
        raise exception 'seller fulfillment context: actor trimming changed';
    end if;

    if commerce.get_order_fulfillment_seller_context(
        target_order_id, 'order-read-seller-18'
    ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_label_seller_context(
           target_order_id, 'order-read-seller-18'
       ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_fulfillment_seller_context(
           9007199254740991, actor
       ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_label_seller_context(
           9007199254740991, actor
       ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_label_seller_context(
           empty_order_id, actor
       ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_fulfillment_seller_context(null, actor)
        is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_label_seller_context(null, actor)
        is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'seller fulfillment context: ownership boundary changed';
    end if;

    if commerce.get_order_fulfillment_seller_context(target_order_id, null)
        is distinct from '{"state":"identity_required"}'::jsonb
       or commerce.get_order_fulfillment_seller_context(target_order_id, '  ')
        is distinct from '{"state":"identity_required"}'::jsonb
       or commerce.get_order_label_seller_context(target_order_id, null)
        is distinct from '{"state":"identity_required"}'::jsonb
       or commerce.get_order_label_seller_context(target_order_id, '  ')
        is distinct from '{"state":"identity_required"}'::jsonb then
        raise exception 'seller fulfillment context: identity boundary changed';
    end if;

    update commerce.order_fulfillments as fulfillment_row
    set status = 'seller_handoff_declared'
    where fulfillment_row.order_id = target_order_id;
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, true,
        'handoff must remain allowed'
    );

    update commerce.order_fulfillments as fulfillment_row
    set status = 'carrier_accepted'
    where fulfillment_row.order_id = target_order_id;
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, false,
        'carrier acceptance must deny'
    );
    update commerce.order_fulfillments as fulfillment_row
    set status = 'label_created'
    where fulfillment_row.order_id = target_order_id;

    update commerce.shipment_creation_operations as creation
    set status = 'failed' where creation.order_id = target_order_id;
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, false,
        'failed creation must deny'
    );
    update commerce.shipment_creation_operations as creation
    set status = 'succeeded' where creation.order_id = target_order_id;

    insert into commerce.order_cancellation_requests (
        order_id, status, requested_by_kind, requested_by, reason
    ) values (target_order_id, 'requested', 'seller', actor, 'test');
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, false,
        'open cancellation must deny'
    );
    update commerce.order_cancellation_requests as cancellation
    set status = 'completed'
    where cancellation.order_id = target_order_id;
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, true,
        'completed cancellation must allow'
    );

    insert into commerce.refund_requests (
        order_id, business_key, reason, status, requested_amount,
        requested_by_kind, requested_by
    ) values (target_order_id, 'seller-context-refund', 'test', 'requested', 100,
        'system', actor);
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, false,
        'open refund must deny'
    );
    update commerce.refund_requests as refund
    set status = 'failed' where refund.order_id = target_order_id;
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, true,
        'failed refund must allow'
    );

    update commerce.orders as order_row set status = 'completed'
    where order_row.id = target_order_id;
    perform pg_temp.assert_seller_label_context(
        target_order_id, order_public_id, actor, false,
        'inactive order must deny'
    );
end;
$contract$;
