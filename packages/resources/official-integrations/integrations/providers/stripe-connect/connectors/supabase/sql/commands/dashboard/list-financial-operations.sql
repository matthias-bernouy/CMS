

create or replace function stripe_connect.list_dashboard_financial_operations(
    p_actor_id text,
    p_actor_kind text,
    p_limit integer,
    p_search text,
    p_status text
)
returns table(operation jsonb, client_reference_id text, payment_currency text)
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
        select operation_row.*
        from stripe_connect.financial_operations as operation_row
        where (p_status is null or operation_row.status = p_status)
          and (p_search is null
            or operation_row.business_key ilike replace(p_search, '*', '%')
            or operation_row.stripe_object_id ilike replace(p_search, '*', '%')
            or operation_row.last_error ilike replace(p_search, '*', '%'))
        order by operation_row.created_at desc
        limit p_limit
    )
    select to_jsonb(operation_row), payment.client_reference_id, payment.currency
    from page as operation_row
    left join stripe_connect.payments as payment on payment.id = operation_row.payment_id
    order by operation_row.created_at desc;
end;
$$;