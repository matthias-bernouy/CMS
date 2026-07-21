do $shipment_creation$
declare
    actor constant text := 'order-read-seller-17';
    target_order_id bigint := (
        select id from commerce.orders
        where public_id = '00000000-0000-4000-8000-000000000042'
    );
    missing_terms_order_id bigint := (
        select id from commerce.orders
        where public_id = '00000000-0000-4000-8000-000000000041'
    );
    order_public_id constant uuid :=
        '00000000-0000-4000-8000-000000000042';
    initial_context jsonb;
begin
    perform pg_temp.assert_shipment_creation_seller_context(
        target_order_id, order_public_id, actor, true,
        'initial projection changed'
    );
    initial_context := commerce.get_order_shipment_creation_seller_context(
        target_order_id, actor
    );
    if commerce.get_order_shipment_creation_seller_context(
        target_order_id, '  ' || actor || '  '
    ) is distinct from initial_context then
        raise exception 'seller shipment creation context: actor trimming changed';
    end if;

    if commerce.get_order_shipment_creation_seller_context(
        target_order_id, 'order-read-seller-18'
    ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_shipment_creation_seller_context(
           9007199254740991, actor
       ) is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_order_shipment_creation_seller_context(null, actor)
        is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'seller shipment creation context: ownership changed';
    end if;
    if commerce.get_order_shipment_creation_seller_context(
        target_order_id, null
    ) is distinct from '{"state":"identity_required"}'::jsonb
       or commerce.get_order_shipment_creation_seller_context(
           target_order_id, '  '
       ) is distinct from '{"state":"identity_required"}'::jsonb then
        raise exception 'seller shipment creation context: identity changed';
    end if;
    if commerce.get_order_shipment_creation_seller_context(
        missing_terms_order_id, actor
    ) is distinct from '{"state":"invalid_authorization"}'::jsonb then
        raise exception 'seller shipment creation context: null terms must fail';
    end if;

    insert into commerce.order_cancellation_requests (
        order_id, status, requested_by_kind, requested_by, reason
    ) values (target_order_id, 'requested', 'seller', actor, 'test race');
    perform pg_temp.assert_shipment_creation_seller_context(
        target_order_id, order_public_id, actor, true,
        'authorization must retain its cancellation predicate'
    );
    update commerce.order_cancellation_requests set status = 'completed'
    where order_id = target_order_id and reason = 'test race';

    update commerce.order_payment_attempts set status = 'processing'
    where order_id = target_order_id;
    perform pg_temp.assert_shipment_creation_seller_context(
        target_order_id, order_public_id, actor, false,
        'unconfirmed payment must deny'
    );
    update commerce.order_payment_attempts set status = 'succeeded'
    where order_id = target_order_id;

    update commerce.order_fulfillments set status = 'carrier_accepted'
    where order_id = target_order_id;
    perform pg_temp.assert_shipment_creation_seller_context(
        target_order_id, order_public_id, actor, false,
        'ineligible fulfillment must deny'
    );
    update commerce.order_fulfillments set status = 'label_created'
    where order_id = target_order_id;

    insert into commerce.refund_requests (
        order_id, business_key, reason, status, requested_amount,
        requested_by_kind, requested_by
    ) values (
        target_order_id, 'shipment-context-refund', 'test', 'requested', 100,
        'system', actor
    );
    perform pg_temp.assert_shipment_creation_seller_context(
        target_order_id, order_public_id, actor, false,
        'open refund must deny'
    );
    update commerce.refund_requests set status = 'failed'
    where business_key = 'shipment-context-refund';

    insert into commerce.stripe_dispute_projections (
        order_id, provider_dispute_id, status, amount, currency, opened_at
    ) values (
        target_order_id, 'dp-shipment-context', 'needs_response',
        11070, 'eur', pg_catalog.now()
    );
    perform pg_temp.assert_shipment_creation_seller_context(
        target_order_id, order_public_id, actor, false,
        'open Stripe dispute must deny'
    );
    update commerce.stripe_dispute_projections set status = 'won'
    where provider_dispute_id = 'dp-shipment-context';

    update commerce.orders set status = 'completed' where id = target_order_id;
    perform pg_temp.assert_shipment_creation_seller_context(
        target_order_id, order_public_id, actor, false,
        'inactive order must deny'
    );
    update commerce.orders set status = 'active' where id = target_order_id;
end;
$shipment_creation$;
