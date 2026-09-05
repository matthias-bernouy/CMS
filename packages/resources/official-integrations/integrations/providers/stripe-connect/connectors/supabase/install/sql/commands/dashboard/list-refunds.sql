

create or replace function stripe_connect.list_dashboard_refunds(
    p_actor_id text,
    p_actor_kind text,
    p_limit integer,
    p_search text,
    p_status text
)
returns table(refund jsonb, client_reference_id text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if p_actor_kind is distinct from 'admin' or nullif(btrim(p_actor_id), '') is null then
        raise exception 'forbidden: the CMS admin role is required';
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 200 then
        raise exception 'validation: limit must be between 1 and 200';
    end if;
    return query
    with page as materialized (
        select refund_row.*
        from stripe_connect.refunds as refund_row
        where (p_status is null or refund_row.status = p_status)
          and (p_search is null
            or refund_row.refund_request_id ilike replace(p_search, '*', '%')
            or refund_row.stripe_refund_id ilike replace(p_search, '*', '%'))
        order by refund_row.created_at desc
        limit p_limit
    )
    select to_jsonb(refund_row), payment.client_reference_id
    from page as refund_row
    join stripe_connect.payments as payment on payment.id = refund_row.payment_id
    order by refund_row.created_at desc;
end;
$$;
