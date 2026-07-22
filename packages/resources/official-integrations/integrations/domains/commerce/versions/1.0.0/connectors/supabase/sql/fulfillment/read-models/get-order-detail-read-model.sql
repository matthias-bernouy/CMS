

create or replace function commerce.get_order_detail_read_model(
    p_scope text,
    p_cms_user_id text default null,
    p_id bigint default null,
    p_public_id text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_scope text := lower(nullif(btrim(p_scope), ''));
    v_cms_user_id text := nullif(btrim(p_cms_user_id), '');
    v_public_id text := nullif(btrim(p_public_id), '');
    v_public_uuid uuid;
    v_seller_id bigint;
    v_order_id bigint;
    v_order_public_id uuid;
    v_order_buyer_cms_user_id text;
    v_authorization jsonb;
    v_result jsonb;
begin
    if v_scope is null or v_scope not in ('buyer', 'seller', 'admin') then
        return jsonb_build_object('state', 'invalid_scope');
    end if;
    if p_id is null and v_public_id is null then
        return jsonb_build_object('state', 'selector_required');
    end if;
    if v_scope = 'seller' then
        if v_cms_user_id is null then
            return jsonb_build_object('state', 'identity_required');
        end if;
        select seller.id into v_seller_id
        from commerce.sellers seller
        where seller.cms_user_id = v_cms_user_id
        limit 1;
        if v_seller_id is null then
            return jsonb_build_object('state', 'not_found');
        end if;
    end if;
    if p_id is null then
        v_public_uuid := v_public_id::uuid;
    end if;

    if v_scope = 'seller' then
        if p_id is not null then
            select order_row.id, order_row.public_id, order_row.buyer_cms_user_id
            into v_order_id, v_order_public_id, v_order_buyer_cms_user_id
            from commerce.orders order_row
            where order_row.id = p_id and order_row.seller_id = v_seller_id;
        else
            select order_row.id, order_row.public_id, order_row.buyer_cms_user_id
            into v_order_id, v_order_public_id, v_order_buyer_cms_user_id
            from commerce.orders order_row
            where order_row.public_id = v_public_uuid and order_row.seller_id = v_seller_id;
        end if;
    elsif p_id is not null then
        select order_row.id, order_row.public_id, order_row.buyer_cms_user_id
        into v_order_id, v_order_public_id, v_order_buyer_cms_user_id
        from commerce.orders order_row
        where order_row.id = p_id;
    else
        select order_row.id, order_row.public_id, order_row.buyer_cms_user_id
        into v_order_id, v_order_public_id, v_order_buyer_cms_user_id
        from commerce.orders order_row
        where order_row.public_id = v_public_uuid;
    end if;

    if v_order_id is null then
        return jsonb_build_object('state', 'not_found');
    end if;
    if v_scope = 'buyer' then
        if v_cms_user_id is null then
            return jsonb_build_object('state', 'identity_required');
        end if;
        if v_order_buyer_cms_user_id is distinct from v_cms_user_id then
            return jsonb_build_object('state', 'not_found');
        end if;
    end if;

    if v_scope = 'seller' then
        v_authorization := commerce.get_order_fulfillment_authorization(v_order_public_id);
        select jsonb_build_object(
            'state', 'ok',
            'order', jsonb_build_object(
                'id', order_row.id,
                'public_id', order_row.public_id,
                'order_number', order_row.order_number,
                'checkout_group_id', order_row.checkout_group_id,
                'status', order_row.status,
                'currency', order_row.currency,
                'subtotal_amount', order_row.subtotal_amount,
                'shipping_amount', order_row.shipping_amount,
                'delivery_quoted_at', order_row.delivery_quoted_at,
                'total_amount', order_row.total_amount,
                'metadata', order_row.metadata,
                'version', order_row.version,
                'created_at', order_row.created_at,
                'updated_at', order_row.updated_at
            ),
            'lines', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', line.id,
                    'order_id', line.order_id,
                    'offer_id', line.offer_id,
                    'product_id', line.product_id,
                    'variant_id', line.variant_id,
                    'accepted_proposal_id', line.accepted_proposal_id,
                    'title', line.title,
                    'sku', line.sku,
                    'quantity', line.quantity,
                    'unit_amount', line.unit_amount,
                    'total_amount', line.total_amount,
                    'product_snapshot', line.product_snapshot,
                    'variant_snapshot', line.variant_snapshot,
                    'offer_snapshot', line.offer_snapshot,
                    'created_at', line.created_at
                ) order by line.id)
                from commerce.order_lines line
                where line.order_id = order_row.id and line.seller_id = v_seller_id
            ), '[]'::jsonb),
            'events', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', event.id,
                    'order_id', event.order_id,
                    'event_type', event.event_type,
                    'previous_status', event.previous_status,
                    'next_status', event.next_status,
                    'created_at', event.created_at
                ) order by event.created_at, event.id)
                from commerce.order_events event
                where event.order_id = order_row.id
            ), '[]'::jsonb),
            'seller', null,
            'operation', (
                select jsonb_build_object(
                    'order_id', operation.order_id,
                    'order_public_id', operation.order_public_id,
                    'order_number', operation.order_number,
                    'currency', operation.currency,
                    'payment_status', operation.payment_status,
                    'fulfillment_status', operation.fulfillment_status,
                    'settlement_status', operation.settlement_status,
                    'claim_status', operation.claim_status,
                    'recipient_handoff_at', operation.recipient_handoff_at,
                    'recipient_handoff_first_observed_at', operation.recipient_handoff_first_observed_at,
                    'claim_window_started_at', operation.claim_window_started_at,
                    'claim_by_at', operation.claim_by_at,
                    'release_eligible_at', operation.release_eligible_at,
                    'updated_at', operation.updated_at
                )
                from commerce.protected_order_operations operation
                where operation.order_id = order_row.id
            ),
            'financial_terms', (
                select jsonb_build_object(
                    'order_id', terms.order_id,
                    'merchandise_subtotal_amount', terms.merchandise_subtotal_amount,
                    'shipping_amount', terms.shipping_amount,
                    'seller_commission_amount', terms.seller_commission_amount,
                    'platform_shipping_share_amount', terms.platform_shipping_share_amount,
                    'seller_shipping_share_amount', terms.seller_shipping_share_amount,
                    'seller_proceeds_amount', terms.seller_proceeds_amount,
                    'seller_transfer_release_amount', terms.seller_transfer_release_amount,
                    'seller_reserve_liability_amount', terms.seller_reserve_liability_amount,
                    'currency', terms.currency,
                    'pricing_locked_at', terms.pricing_locked_at,
                    'pay_by_at', terms.pay_by_at,
                    'financial_revision', terms.financial_revision
                )
                from commerce.order_financial_terms terms
                where terms.order_id = order_row.id
            ),
            'fulfillment', (
                select jsonb_build_object(
                    'order_id', fulfillment.order_id,
                    'status', fulfillment.status,
                    'seller_handoff_deadline', fulfillment.seller_handoff_deadline,
                    'scan_grace_deadline', fulfillment.scan_grace_deadline,
                    'seller_handoff_declared_at', fulfillment.seller_handoff_declared_at,
                    'carrier_accepted_at', fulfillment.carrier_accepted_at,
                    'recipient_handoff_at', fulfillment.recipient_handoff_at,
                    'recipient_handoff_first_observed_at', fulfillment.recipient_handoff_first_observed_at,
                    'claim_window_started_at', fulfillment.claim_window_started_at,
                    'claim_by_at', fulfillment.claim_by_at,
                    'release_eligible_at', fulfillment.release_eligible_at,
                    'blocking_reason', fulfillment.blocking_reason,
                    'version', fulfillment.version
                )
                from commerce.order_fulfillments fulfillment
                where fulfillment.order_id = order_row.id
            ),
            'settlement', (
                select jsonb_build_object(
                    'order_id', settlement.order_id,
                    'status', settlement.status,
                    'authorized_seller_amount', settlement.authorized_seller_amount,
                    'total_transferred_amount', settlement.total_transferred_amount,
                    'total_reversed_amount', settlement.total_reversed_amount,
                    'seller_reserve_liability_remaining_amount', settlement.seller_reserve_liability_remaining_amount,
                    'version', settlement.version
                )
                from commerce.order_settlements settlement
                where settlement.order_id = order_row.id
            ),
            'claim', null,
            'authorization', case when v_authorization is null then null else jsonb_build_object(
                'allowed', v_authorization->'allowed',
                'reason', v_authorization->'reason',
                'order_id', v_authorization->'orderId',
                'order_public_id', v_authorization->'orderPublicId',
                'seller_id', v_authorization->'sellerId',
                'currency', v_authorization->'currency',
                'payment_status', v_authorization->'paymentStatus',
                'fulfillment_status', v_authorization->'fulfillmentStatus'
            ) end,
            'definitions', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'key', definition.key,
                    'label', definition.label,
                    'field_type', definition.field_type,
                    'unit', definition.unit
                ) order by definition.position, definition.key)
                from commerce.custom_field_definitions definition
                where definition.entity_type = 'order'
                  and definition.public_readable
                  and definition.enabled
            ), '[]'::jsonb)
        ) into v_result
        from commerce.orders order_row
        where order_row.id = v_order_id;
    else
        select jsonb_build_object(
            'state', 'ok',
            'order', jsonb_build_object(
                'id', order_row.id,
                'public_id', order_row.public_id,
                'order_number', order_row.order_number,
                'checkout_group_id', order_row.checkout_group_id,
                'seller_id', order_row.seller_id,
                'buyer_cms_user_id', order_row.buyer_cms_user_id,
                'status', order_row.status,
                'currency', order_row.currency,
                'subtotal_amount', order_row.subtotal_amount,
                'shipping_amount', order_row.shipping_amount,
                'delivery_quoted_at', order_row.delivery_quoted_at,
                'total_amount', order_row.total_amount,
                'shipping_address', order_row.shipping_address,
                'billing_address', order_row.billing_address,
                'metadata', order_row.metadata,
                'idempotency_key', order_row.idempotency_key,
                'archived_at', order_row.archived_at,
                'version', order_row.version,
                'created_at', order_row.created_at,
                'updated_at', order_row.updated_at
            ),
            'lines', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', line.id,
                    'order_id', line.order_id,
                    'offer_id', line.offer_id,
                    'product_id', line.product_id,
                    'variant_id', line.variant_id,
                    'accepted_proposal_id', line.accepted_proposal_id,
                    'title', line.title,
                    'sku', line.sku,
                    'quantity', line.quantity,
                    'unit_amount', line.unit_amount,
                    'total_amount', line.total_amount,
                    'product_snapshot', line.product_snapshot,
                    'variant_snapshot', line.variant_snapshot,
                    'offer_snapshot', line.offer_snapshot,
                    'seller_snapshot', line.seller_snapshot,
                    'created_at', line.created_at
                ) order by line.id)
                from commerce.order_lines line
                where line.order_id = order_row.id
            ), '[]'::jsonb),
            'events', case when v_scope = 'admin' then coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', event.id,
                    'order_id', event.order_id,
                    'event_type', event.event_type,
                    'actor_kind', event.actor_kind,
                    'actor_id', event.actor_id,
                    'previous_status', event.previous_status,
                    'next_status', event.next_status,
                    'message', event.message,
                    'data', event.data,
                    'created_at', event.created_at
                ) order by event.created_at, event.id)
                from commerce.order_events event
                where event.order_id = order_row.id
            ), '[]'::jsonb) else coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', event.id,
                    'order_id', event.order_id,
                    'event_type', event.event_type,
                    'previous_status', event.previous_status,
                    'next_status', event.next_status,
                    'created_at', event.created_at
                ) order by event.created_at, event.id)
                from commerce.order_events event
                where event.order_id = order_row.id
            ), '[]'::jsonb) end,
            'seller', (
                select jsonb_build_object(
                    'id', seller.id,
                    'kind', seller.kind,
                    'slug', seller.slug,
                    'display_name', seller.display_name
                )
                from commerce.sellers seller
                where seller.id = order_row.seller_id
            ),
            'operation', (
                select jsonb_build_object(
                    'order_id', operation.order_id,
                    'order_public_id', operation.order_public_id,
                    'order_number', operation.order_number,
                    'buyer_cms_user_id', operation.buyer_cms_user_id,
                    'seller_id', operation.seller_id,
                    'currency', operation.currency,
                    'buyer_total_amount', operation.buyer_total_amount,
                    'seller_proceeds_amount', operation.seller_proceeds_amount,
                    'platform_retained_amount', operation.platform_retained_amount,
                    'financial_terms_hash', operation.financial_terms_hash,
                    'payment_status', operation.payment_status,
                    'fulfillment_status', operation.fulfillment_status,
                    'settlement_status', operation.settlement_status,
                    'claim_status', operation.claim_status,
                    'total_refund_requested_amount', operation.total_refund_requested_amount,
                    'release_eligible_at', operation.release_eligible_at,
                    'recipient_handoff_at', operation.recipient_handoff_at,
                    'recipient_handoff_first_observed_at', operation.recipient_handoff_first_observed_at,
                    'claim_window_started_at', operation.claim_window_started_at,
                    'claim_by_at', operation.claim_by_at,
                    'updated_at', operation.updated_at
                )
                from commerce.protected_order_operations operation
                where operation.order_id = order_row.id
            ),
            'financial_terms', (
                select jsonb_build_object(
                    'order_id', terms.order_id,
                    'delivery_quote_id', terms.delivery_quote_id,
                    'merchandise_subtotal_amount', terms.merchandise_subtotal_amount,
                    'shipping_amount', terms.shipping_amount,
                    'buyer_protection_fee_amount', terms.buyer_protection_fee_amount,
                    'seller_commission_amount', terms.seller_commission_amount,
                    'buyer_total_amount', terms.buyer_total_amount,
                    'seller_proceeds_amount', terms.seller_proceeds_amount,
                    'platform_retained_amount', terms.platform_retained_amount,
                    'currency', terms.currency,
                    'financial_terms_hash', terms.financial_terms_hash,
                    'pricing_locked_at', terms.pricing_locked_at,
                    'pay_by_at', terms.pay_by_at,
                    'financial_revision', terms.financial_revision
                )
                from commerce.order_financial_terms terms
                where terms.order_id = order_row.id
            ),
            'fulfillment', (
                select jsonb_build_object(
                    'order_id', fulfillment.order_id,
                    'status', fulfillment.status,
                    'seller_handoff_deadline', fulfillment.seller_handoff_deadline,
                    'scan_grace_deadline', fulfillment.scan_grace_deadline,
                    'carrier_accepted_at', fulfillment.carrier_accepted_at,
                    'arrived_at_pickup_point_at', fulfillment.arrived_at_pickup_point_at,
                    'available_for_pickup_at', fulfillment.available_for_pickup_at,
                    'recipient_handoff_at', fulfillment.recipient_handoff_at,
                    'recipient_handoff_first_observed_at', fulfillment.recipient_handoff_first_observed_at,
                    'claim_window_started_at', fulfillment.claim_window_started_at,
                    'claim_by_at', fulfillment.claim_by_at,
                    'release_eligible_at', fulfillment.release_eligible_at,
                    'blocking_reason', fulfillment.blocking_reason,
                    'version', fulfillment.version
                )
                from commerce.order_fulfillments fulfillment
                where fulfillment.order_id = order_row.id
            ),
            'settlement', (
                select jsonb_build_object(
                    'order_id', settlement.order_id,
                    'status', settlement.status,
                    'authorized_seller_amount', settlement.authorized_seller_amount,
                    'total_transferred_amount', settlement.total_transferred_amount,
                    'total_reversed_amount', settlement.total_reversed_amount,
                    'total_refunded_amount', settlement.total_refunded_amount,
                    'seller_reserve_liability_remaining_amount', settlement.seller_reserve_liability_remaining_amount,
                    'version', settlement.version
                )
                from commerce.order_settlements settlement
                where settlement.order_id = order_row.id
            ),
            'claim', (
                select jsonb_build_object(
                    'id', claim.id,
                    'public_id', claim.public_id,
                    'reason', claim.reason,
                    'status', claim.status,
                    'seller_response_by_at', claim.seller_response_by_at,
                    'return_ship_by_at', claim.return_ship_by_at,
                    'resolved_at', claim.resolved_at,
                    'version', claim.version,
                    'created_at', claim.created_at
                )
                from commerce.marketplace_claims claim
                where claim.order_id = order_row.id
                order by claim.created_at desc
                limit 1
            ),
            'authorization', null,
            'definitions', case when v_scope = 'buyer' then coalesce((
                select jsonb_agg(jsonb_build_object(
                    'key', definition.key,
                    'label', definition.label,
                    'field_type', definition.field_type,
                    'unit', definition.unit
                ) order by definition.position, definition.key)
                from commerce.custom_field_definitions definition
                where definition.entity_type = 'order'
                  and definition.public_readable
                  and definition.enabled
            ), '[]'::jsonb) else '[]'::jsonb end
        ) into v_result
        from commerce.orders order_row
        where order_row.id = v_order_id;
    end if;
    return v_result;
end;
$$;