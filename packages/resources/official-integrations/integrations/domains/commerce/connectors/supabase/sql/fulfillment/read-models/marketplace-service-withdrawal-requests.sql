create or replace function commerce.marketplace_service_withdrawal_request_read_model(
    p_request_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select
        (
            to_jsonb(request_row)
            - 'idempotency_key'
            - 'request_hash'
        ) || jsonb_build_object(
            'order_public_id', order_row.public_id,
            'order_number', order_row.order_number,
            'events', coalesce((
                select jsonb_agg(
                    to_jsonb(event_row) - 'request_id' - 'order_id'
                    order by event_row.created_at, event_row.id
                )
                from commerce.marketplace_service_withdrawal_events event_row
                where event_row.request_id = request_row.id
            ), '[]'::jsonb)
        )
    from commerce.marketplace_service_withdrawal_requests request_row
    join commerce.orders order_row on order_row.id = request_row.order_id
    where request_row.id = p_request_id
$$;

create or replace function commerce.list_marketplace_service_withdrawal_requests(
    p_access_buyer_cms_user_id text default null,
    p_buyer_cms_user_id text default null,
    p_request_public_id uuid default null,
    p_order_id bigint default null,
    p_status text default null,
    p_service_scope text default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_access_buyer text := nullif(btrim(p_access_buyer_cms_user_id), '');
    v_buyer_filter text := nullif(btrim(p_buyer_cms_user_id), '');
    v_items jsonb;
    v_total bigint;
begin
    if p_access_buyer_cms_user_id is not null and v_access_buyer is null then
        raise exception 'forbidden: missing CMS user id';
    end if;
    if p_order_id is not null and p_order_id <= 0 then
        raise exception 'validation: order id must be positive';
    end if;
    if p_status is not null
        and p_status not in ('submitted', 'under_review', 'information_requested', 'resolved') then
        raise exception 'validation: unsupported service withdrawal status';
    end if;
    if p_service_scope is not null
        and p_service_scope !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: invalid service scope';
    end if;
    if p_limit is null or p_limit not between 1 and 100
        or p_offset is null or p_offset < 0 then
        raise exception 'validation: invalid pagination';
    end if;

    select count(*) into v_total
    from commerce.marketplace_service_withdrawal_requests request_row
    where (v_access_buyer is null or request_row.buyer_cms_user_id = v_access_buyer)
      and (v_buyer_filter is null or request_row.buyer_cms_user_id = v_buyer_filter)
      and (p_request_public_id is null or request_row.public_id = p_request_public_id)
      and (p_order_id is null or request_row.order_id = p_order_id)
      and (p_status is null or request_row.status = p_status)
      and (p_service_scope is null or request_row.service_scope = p_service_scope);

    select coalesce(jsonb_agg(
        commerce.marketplace_service_withdrawal_request_read_model(selected.id)
        order by selected.submitted_at desc, selected.id desc
    ), '[]'::jsonb)
    into v_items
    from (
        select request_row.id, request_row.submitted_at
        from commerce.marketplace_service_withdrawal_requests request_row
        where (v_access_buyer is null or request_row.buyer_cms_user_id = v_access_buyer)
          and (v_buyer_filter is null or request_row.buyer_cms_user_id = v_buyer_filter)
          and (p_request_public_id is null or request_row.public_id = p_request_public_id)
          and (p_order_id is null or request_row.order_id = p_order_id)
          and (p_status is null or request_row.status = p_status)
          and (p_service_scope is null or request_row.service_scope = p_service_scope)
        order by request_row.submitted_at desc, request_row.id desc
        limit p_limit offset p_offset
    ) selected;

    return jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'limit', p_limit,
        'offset', p_offset
    );
end;
$$;

comment on function commerce.list_marketplace_service_withdrawal_requests(
    text, text, uuid, bigint, text, text, integer, integer
) is
    'Lists service withdrawal requests. A non-null access buyer restricts the complete result to that buyer.';
