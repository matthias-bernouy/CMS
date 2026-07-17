\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir baseline.fixture.sql
\ir detail.fixture.sql

create function pg_temp.jsonb_keys(p_value jsonb)
returns text[] language sql immutable as $$
    select coalesce(array_agg(key order by key), array[]::text[])
    from jsonb_object_keys(p_value) key;
$$;

do $$
declare
    v_order_id bigint := (
        select id from commerce.orders where order_number = 'ORDER-READ-42'
    );
    v_buyer jsonb := commerce.get_order_detail_read_model(
        'buyer', 'order-read-buyer-a', v_order_id, null
    );
    v_seller jsonb := commerce.get_order_detail_read_model(
        'seller', 'order-read-seller-17', v_order_id, null
    );
    v_admin jsonb := commerce.get_order_detail_read_model(
        'admin', null, v_order_id, null
    );
    v_expected_root text[] := array[
        'authorization', 'claim', 'definitions', 'events', 'financial_terms',
        'fulfillment', 'lines', 'operation', 'order', 'seller', 'settlement', 'state'
    ];
begin
    if v_buyer->>'state' <> 'ok' or v_seller->>'state' <> 'ok'
        or v_admin->>'state' <> 'ok'
        or pg_temp.jsonb_keys(v_buyer) <> v_expected_root
        or pg_temp.jsonb_keys(v_seller) <> v_expected_root
        or pg_temp.jsonb_keys(v_admin) <> v_expected_root then
        raise exception 'order detail RPC: envelope changed';
    end if;

    if pg_temp.jsonb_keys(v_buyer->'order') <> array[
        'archived_at', 'billing_address', 'buyer_cms_user_id', 'checkout_group_id',
        'created_at', 'currency', 'delivery_quoted_at', 'id', 'idempotency_key',
        'metadata', 'order_number', 'public_id', 'seller_id', 'shipping_address',
        'shipping_amount', 'status', 'subtotal_amount', 'total_amount', 'updated_at', 'version'
    ] or pg_temp.jsonb_keys(v_admin->'order') <> pg_temp.jsonb_keys(v_buyer->'order')
        or v_buyer->'order' ? 'request_hash' then
        raise exception 'order detail RPC: buyer/admin order projection changed';
    end if;
    if pg_temp.jsonb_keys(v_seller->'order') <> array[
        'checkout_group_id', 'created_at', 'currency', 'delivery_quoted_at', 'id',
        'metadata', 'order_number', 'public_id', 'shipping_amount', 'status',
        'subtotal_amount', 'total_amount', 'updated_at', 'version'
    ] or v_seller->'order' ?| array[
        'seller_id', 'buyer_cms_user_id', 'shipping_address', 'billing_address',
        'idempotency_key', 'request_hash', 'archived_at'
    ] then raise exception 'order detail RPC: seller order projection leaked'; end if;

    if pg_temp.jsonb_keys(v_buyer->'lines'->0) <> array[
        'accepted_proposal_id', 'created_at', 'id', 'offer_id', 'offer_snapshot',
        'order_id', 'product_id', 'product_snapshot', 'quantity', 'seller_snapshot',
        'sku', 'title', 'total_amount', 'unit_amount', 'variant_id', 'variant_snapshot'
    ] or pg_temp.jsonb_keys(v_seller->'lines'->0) <> array[
        'accepted_proposal_id', 'created_at', 'id', 'offer_id', 'offer_snapshot',
        'order_id', 'product_id', 'product_snapshot', 'quantity', 'sku', 'title',
        'total_amount', 'unit_amount', 'variant_id', 'variant_snapshot'
    ] or (select array_agg(item->>'title') from jsonb_array_elements(v_buyer->'lines') item)
        <> array['Baseline line A', 'Baseline line B'] then
        raise exception 'order detail RPC: line projection/order changed';
    end if;

    if pg_temp.jsonb_keys(v_buyer->'events'->0) <> array[
        'created_at', 'event_type', 'id', 'next_status', 'order_id', 'previous_status'
    ] or pg_temp.jsonb_keys(v_seller->'events'->0)
        <> pg_temp.jsonb_keys(v_buyer->'events'->0)
        or pg_temp.jsonb_keys(v_admin->'events'->0) <> array[
            'actor_id', 'actor_kind', 'created_at', 'data', 'event_type', 'id',
            'message', 'next_status', 'order_id', 'previous_status'
        ] or (select array_agg((item->>'id')::bigint)
            from jsonb_array_elements(v_buyer->'events') item)
            <> array[9400000000201, 9400000000202]::bigint[] then
        raise exception 'order detail RPC: event projection/order changed';
    end if;

    if pg_temp.jsonb_keys(v_buyer->'operation') <> array[
        'buyer_cms_user_id', 'buyer_total_amount', 'claim_by_at', 'claim_status',
        'claim_window_started_at', 'currency', 'financial_terms_hash',
        'fulfillment_status', 'order_id', 'order_number', 'order_public_id',
        'payment_status', 'platform_retained_amount', 'recipient_handoff_at',
        'recipient_handoff_first_observed_at', 'release_eligible_at', 'seller_id',
        'seller_proceeds_amount', 'settlement_status', 'total_refund_requested_amount',
        'updated_at'
    ] or pg_temp.jsonb_keys(v_seller->'operation') <> array[
        'claim_by_at', 'claim_status', 'claim_window_started_at', 'currency',
        'fulfillment_status', 'order_id', 'order_number', 'order_public_id',
        'payment_status', 'recipient_handoff_at', 'recipient_handoff_first_observed_at',
        'release_eligible_at', 'settlement_status', 'updated_at'
    ] then raise exception 'order detail RPC: operation projection changed'; end if;

    if pg_temp.jsonb_keys(v_buyer->'financial_terms') <> array[
        'buyer_protection_fee_amount', 'buyer_total_amount', 'currency',
        'delivery_quote_id', 'financial_revision', 'financial_terms_hash',
        'merchandise_subtotal_amount', 'order_id', 'pay_by_at',
        'platform_retained_amount', 'pricing_locked_at', 'seller_commission_amount',
        'seller_proceeds_amount', 'shipping_amount'
    ] or pg_temp.jsonb_keys(v_seller->'financial_terms') <> array[
        'currency', 'financial_revision', 'merchandise_subtotal_amount', 'order_id',
        'pay_by_at', 'platform_shipping_share_amount', 'pricing_locked_at',
        'seller_commission_amount', 'seller_proceeds_amount',
        'seller_reserve_liability_amount', 'seller_shipping_share_amount',
        'seller_transfer_release_amount', 'shipping_amount'
    ] then raise exception 'order detail RPC: financial projection changed'; end if;

    if pg_temp.jsonb_keys(v_buyer->'fulfillment') <> array[
        'arrived_at_pickup_point_at', 'available_for_pickup_at', 'blocking_reason',
        'carrier_accepted_at', 'claim_by_at', 'claim_window_started_at', 'order_id',
        'recipient_handoff_at', 'recipient_handoff_first_observed_at',
        'release_eligible_at', 'scan_grace_deadline', 'seller_handoff_deadline',
        'status', 'version'
    ] or pg_temp.jsonb_keys(v_seller->'fulfillment') <> array[
        'blocking_reason', 'carrier_accepted_at', 'claim_by_at',
        'claim_window_started_at', 'order_id', 'recipient_handoff_at',
        'recipient_handoff_first_observed_at', 'release_eligible_at',
        'scan_grace_deadline', 'seller_handoff_deadline', 'seller_handoff_declared_at',
        'status', 'version'
    ] then raise exception 'order detail RPC: fulfillment projection changed'; end if;

    if pg_temp.jsonb_keys(v_buyer->'settlement') <> array[
        'authorized_seller_amount', 'order_id', 'seller_reserve_liability_remaining_amount',
        'status', 'total_refunded_amount', 'total_reversed_amount',
        'total_transferred_amount', 'version'
    ] or pg_temp.jsonb_keys(v_seller->'settlement') <> array[
        'authorized_seller_amount', 'order_id', 'seller_reserve_liability_remaining_amount',
        'status', 'total_reversed_amount', 'total_transferred_amount', 'version'
    ] then raise exception 'order detail RPC: settlement projection changed'; end if;

    if pg_temp.jsonb_keys(v_buyer->'claim') <> array[
        'created_at', 'id', 'public_id', 'reason', 'resolved_at', 'return_ship_by_at',
        'seller_response_by_at', 'status', 'version'
    ] or v_buyer->'claim'->>'public_id' <> '20000000-0000-4000-8000-000000000088'
        or v_seller->'claim' <> 'null'::jsonb
        or pg_temp.jsonb_keys(v_seller->'authorization') <> array[
            'allowed', 'currency', 'fulfillment_status', 'order_id', 'order_public_id',
            'payment_status', 'reason', 'seller_id'
        ] or v_seller->'authorization'->>'seller_id' <> 'order-read-seller-17'
        or not (v_seller->'authorization' ? 'reason')
        or v_seller->'authorization'->'reason' <> 'null'::jsonb then
        raise exception 'order detail RPC: claim/authorization changed';
    end if;

    if (select array_agg(item->>'key') from jsonb_array_elements(v_buyer->'definitions') item)
        <> array['detailPublicA', 'detailPublicB']
        or v_seller->'definitions' <> v_buyer->'definitions'
        or v_admin->'definitions' <> '[]'::jsonb
        or v_seller::text like '%order-read-buyer-a%'
        or v_seller::text like '%financial_terms_hash%' then
        raise exception 'order detail RPC: definitions/privacy changed';
    end if;
end;
$$;

rollback;
