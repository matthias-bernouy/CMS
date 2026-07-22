

create or replace function commerce_negotiation.list_admin_proposals(
    p_query text default null,
    p_status text default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
    v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
    perform commerce_negotiation.expire_pending_proposals();
    return (
        with filtered as materialized (
            select proposal.*
            from commerce_negotiation.proposals proposal
            where (p_status is null or proposal.status = p_status)
              and (
                  p_query is null
                  or proposal.commerce_offer_title ilike '%' || p_query || '%'
                  or proposal.commerce_offer_slug ilike '%' || p_query || '%'
                  or proposal.buyer_cms_user_id ilike '%' || p_query || '%'
                  or proposal.seller_cms_user_id ilike '%' || p_query || '%'
              )
        ), page as (
            select filtered.*
            from filtered
            order by filtered.created_at desc
            limit v_limit offset v_offset
        )
        select jsonb_build_object(
            'items', coalesce(
                (select jsonb_agg(to_jsonb(page) order by page.created_at desc) from page),
                '[]'::jsonb
            ),
            'total', (select count(*) from filtered)
        )
    );
end;
$$;