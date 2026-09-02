\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir baseline.fixture.sql
\ir detail.fixture.sql

do $$
declare
    v_order_id bigint := (
        select id from commerce.orders where order_number = 'ORDER-READ-42'
    );
    v_seller_id bigint := (
        select id from commerce.sellers where cms_user_id = 'order-read-seller-17'
    );
    v_order jsonb;
    v_keys text[];
    v_line_titles text[];
    v_event_ids bigint[];
    v_definition_keys text[];
    v_public_metadata jsonb;
    v_claim jsonb;
    v_operation jsonb;
begin
    select to_jsonb(projected) into v_order from (
        select id, public_id, order_number, checkout_group_id, seller_id,
            buyer_cms_user_id, status, currency, subtotal_amount, shipping_amount,
            delivery_quoted_at, total_amount, shipping_address, billing_address,
            metadata, idempotency_key, archived_at, version, created_at, updated_at
        from commerce.orders where id = v_order_id
    ) projected;
    select array_agg(key order by key) into v_keys from jsonb_object_keys(v_order) key;
    if v_keys <> array[
        'archived_at', 'billing_address', 'buyer_cms_user_id', 'checkout_group_id',
        'created_at', 'currency', 'delivery_quoted_at', 'id', 'idempotency_key',
        'metadata', 'order_number', 'public_id', 'seller_id', 'shipping_address',
        'shipping_amount', 'status', 'subtotal_amount', 'total_amount', 'updated_at', 'version'
    ] or v_order ? 'request_hash' then
        raise exception 'order detail baseline: order projection changed: %', v_keys;
    end if;
    if (select id from commerce.orders where public_id = (v_order->>'public_id')::uuid) <> v_order_id
        or exists (select 1 from commerce.orders where id = v_order_id and buyer_cms_user_id = 'other-buyer')
        or exists (select 1 from commerce.orders where id = v_order_id and seller_id <> v_seller_id) then
        raise exception 'order detail baseline: lookup or ownership changed';
    end if;

    select array_agg(title order by id) into v_line_titles
    from commerce.order_lines where order_id = v_order_id and seller_id = v_seller_id;
    if v_line_titles <> array['Baseline line A', 'Baseline line B'] then
        raise exception 'order detail baseline: line ordering changed: %', v_line_titles;
    end if;
    select array_agg(id order by created_at, id) into v_event_ids
    from commerce.order_events where order_id = v_order_id;
    if v_event_ids <> array[9400000000201, 9400000000202]::bigint[] then
        raise exception 'order detail baseline: event ordering changed: %', v_event_ids;
    end if;

    select array_agg(key order by position, key) into v_definition_keys
    from commerce.custom_field_definitions
    where entity_type = 'order' and public_readable and enabled;
    if v_definition_keys <> array['detailPublicA', 'detailPublicB'] then
        raise exception 'order detail baseline: public definitions changed: %', v_definition_keys;
    end if;
    select coalesce(jsonb_object_agg(definition.key, order_row.metadata->definition.key), '{}')
    into v_public_metadata
    from commerce.orders order_row
    join commerce.custom_field_definitions definition
      on definition.entity_type = 'order' and definition.public_readable and definition.enabled
    where order_row.id = v_order_id and order_row.metadata ? definition.key;
    if v_public_metadata <> '{"detailPublicA":305,"detailPublicB":"Ring twice"}'::jsonb then
        raise exception 'order detail baseline: public metadata changed: %', v_public_metadata;
    end if;

    select to_jsonb(operation) into v_operation
    from commerce.protected_order_operations operation where order_id = v_order_id;
    if v_operation->>'payment_status' <> 'succeeded'
        or v_operation->>'fulfillment_status' <> 'awaiting_shipment'
        or v_operation->>'settlement_status' <> 'held'
        or v_operation->>'claim_status' <> 'open' then
        raise exception 'order detail baseline: operation changed: %', v_operation;
    end if;
    select to_jsonb(projected) into v_claim from (
        select id, public_id, reason, status, seller_response_by_at,
            return_ship_by_at, resolved_at, version, created_at
        from commerce.marketplace_claims where order_id = v_order_id
        order by created_at desc limit 1
    ) projected;
    if v_claim->>'public_id' <> '20000000-0000-4000-8000-000000000088'
        or v_claim->>'status' <> 'open' then
        raise exception 'order detail baseline: latest claim changed: %', v_claim;
    end if;
    if not exists (select 1 from commerce.sellers where id = v_seller_id)
        or not exists (select 1 from commerce.order_financial_terms where order_id = v_order_id)
        or not exists (select 1 from commerce.order_fulfillments where order_id = v_order_id)
        or not exists (select 1 from commerce.order_settlements where order_id = v_order_id)
        or exists (
            select 1 from commerce.protected_order_operations
            where order_id = (select id from commerce.orders where order_number = 'ORDER-READ-41')
        ) then raise exception 'order detail baseline: optional relation presence changed'; end if;
end;
$$;

rollback;
