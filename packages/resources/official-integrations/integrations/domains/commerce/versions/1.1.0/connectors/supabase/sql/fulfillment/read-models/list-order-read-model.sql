

create or replace function commerce.list_order_read_model(
    p_scope text,
    p_cms_user_id text default null,
    p_status text default null,
    p_seller_id bigint default null,
    p_limit integer default 50,
    p_offset bigint default 0
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
    v_status text := nullif(btrim(p_status), '');
    v_seller_id bigint;
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
    v_offset bigint := greatest(coalesce(p_offset, 0), 0);
    v_result jsonb;
begin
    if v_scope is null or v_scope not in ('buyer', 'seller', 'admin') then
        return jsonb_build_object(
            'state', 'invalid_scope', 'orders', '[]'::jsonb,
            'operations', '[]'::jsonb, 'definitions', '[]'::jsonb, 'total', 0
        );
    end if;
    if v_scope in ('buyer', 'seller') and v_cms_user_id is null then
        return jsonb_build_object(
            'state', 'identity_required', 'orders', '[]'::jsonb,
            'operations', '[]'::jsonb, 'definitions', '[]'::jsonb, 'total', 0
        );
    end if;
    if v_scope = 'seller' then
        select seller.id into v_seller_id
        from commerce.sellers seller
        where seller.cms_user_id = v_cms_user_id
        limit 1;
        if v_seller_id is null then
            return jsonb_build_object(
                'state', 'seller_missing', 'orders', '[]'::jsonb,
                'operations', '[]'::jsonb, 'definitions', '[]'::jsonb, 'total', 0
            );
        end if;
    end if;

    if v_scope = 'buyer' then
        with filtered as materialized (
            select order_row.id, order_row.created_at
            from commerce.orders order_row
            where order_row.buyer_cms_user_id = v_cms_user_id
              and (v_status is null or order_row.status = v_status)
        ), page as materialized (
            select filtered.id, filtered.created_at
            from filtered
            order by filtered.created_at desc, filtered.id desc
            limit v_limit offset v_offset
        ), line_summaries as materialized (
            select order_line.order_id,
                (array_agg(order_line.title order by order_line.id))[1] as first_title,
                count(*) as line_count,
                coalesce(sum(order_line.quantity), 0) as total_quantity
            from commerce.order_lines order_line
            join page on page.id = order_line.order_id
            group by order_line.order_id
        )
        select jsonb_build_object(
            'state', 'ok',
            'orders', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', order_row.id,
                    'public_id', order_row.public_id,
                    'order_number', order_row.order_number,
                    'line_summary', jsonb_build_object(
                        'first_title', line_summary.first_title,
                        'line_count', coalesce(line_summary.line_count, 0),
                        'total_quantity', coalesce(line_summary.total_quantity, 0)
                    ),
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
                ) order by page.created_at desc, page.id desc)
                from page
                join commerce.orders order_row on order_row.id = page.id
                left join line_summaries line_summary on line_summary.order_id = page.id
            ), '[]'::jsonb),
            'operations', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'order_id', operation.order_id,
                    'payment_status', operation.payment_status,
                    'fulfillment_status', operation.fulfillment_status,
                    'settlement_status', operation.settlement_status,
                    'claim_status', operation.claim_status,
                    'total_refund_requested_amount', operation.total_refund_requested_amount,
                    'updated_at', operation.updated_at
                ) order by page.created_at desc, page.id desc)
                from page
                join commerce.protected_order_operations operation
                  on operation.order_id = page.id
            ), '[]'::jsonb),
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
            ), '[]'::jsonb),
            'total', (select count(*) from filtered)
        ) into v_result;
    elsif v_scope = 'seller' then
        with filtered as materialized (
            select order_row.id, order_row.created_at
            from commerce.orders order_row
            where order_row.seller_id = v_seller_id
              and (v_status is null or order_row.status = v_status)
        ), page as materialized (
            select filtered.id, filtered.created_at
            from filtered
            order by filtered.created_at desc, filtered.id desc
            limit v_limit offset v_offset
        ), line_summaries as materialized (
            select order_line.order_id,
                (array_agg(order_line.title order by order_line.id))[1] as first_title,
                count(*) as line_count,
                coalesce(sum(order_line.quantity), 0) as total_quantity
            from commerce.order_lines order_line
            join page on page.id = order_line.order_id
            group by order_line.order_id
        )
        select jsonb_build_object(
            'state', 'ok',
            'orders', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', order_row.id,
                    'public_id', order_row.public_id,
                    'order_number', order_row.order_number,
                    'line_summary', jsonb_build_object(
                        'first_title', line_summary.first_title,
                        'line_count', coalesce(line_summary.line_count, 0),
                        'total_quantity', coalesce(line_summary.total_quantity, 0)
                    ),
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
                ) order by page.created_at desc, page.id desc)
                from page
                join commerce.orders order_row on order_row.id = page.id
                left join line_summaries line_summary on line_summary.order_id = page.id
            ), '[]'::jsonb),
            'operations', '[]'::jsonb,
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
            ), '[]'::jsonb),
            'total', (select count(*) from filtered)
        ) into v_result;
    else
        with filtered as materialized (
            select order_row.id, order_row.created_at
            from commerce.orders order_row
            where (v_status is null or order_row.status = v_status)
              and (p_seller_id is null or order_row.seller_id = p_seller_id)
        ), page as materialized (
            select filtered.id, filtered.created_at
            from filtered
            order by filtered.created_at desc, filtered.id desc
            limit v_limit offset v_offset
        ), line_summaries as materialized (
            select order_line.order_id,
                (array_agg(order_line.title order by order_line.id))[1] as first_title,
                count(*) as line_count,
                coalesce(sum(order_line.quantity), 0) as total_quantity
            from commerce.order_lines order_line
            join page on page.id = order_line.order_id
            group by order_line.order_id
        )
        select jsonb_build_object(
            'state', 'ok',
            'orders', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', order_row.id,
                    'public_id', order_row.public_id,
                    'order_number', order_row.order_number,
                    'line_summary', jsonb_build_object(
                        'first_title', line_summary.first_title,
                        'line_count', coalesce(line_summary.line_count, 0),
                        'total_quantity', coalesce(line_summary.total_quantity, 0)
                    ),
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
                ) order by page.created_at desc, page.id desc)
                from page
                join commerce.orders order_row on order_row.id = page.id
                left join line_summaries line_summary on line_summary.order_id = page.id
            ), '[]'::jsonb),
            'operations', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'order_id', operation.order_id,
                    'payment_status', operation.payment_status,
                    'fulfillment_status', operation.fulfillment_status,
                    'settlement_status', operation.settlement_status,
                    'claim_status', operation.claim_status,
                    'total_refund_requested_amount', operation.total_refund_requested_amount,
                    'updated_at', operation.updated_at
                ) order by page.created_at desc, page.id desc)
                from page
                join commerce.protected_order_operations operation
                  on operation.order_id = page.id
            ), '[]'::jsonb),
            'definitions', '[]'::jsonb,
            'total', (select count(*) from filtered)
        ) into v_result;
    end if;
    return v_result;
end;
$$;