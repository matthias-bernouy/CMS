

create or replace function commerce_negotiation.list_participant_proposals(
    p_user_id text,
    p_role text default null,
    p_status text default null,
    p_offer_id bigint default null,
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
    if p_user_id is null or btrim(p_user_id) = '' then
        raise exception 'unauthorized: CMS user identity required';
    end if;
    if p_role is not null and p_role not in ('buyer', 'seller') then
        raise exception 'validation: role is invalid';
    end if;
    perform commerce_negotiation.expire_pending_proposals();
    return (
        with filtered as materialized (
            select proposal.*,
                commerce_negotiation.project_proposal(proposal) projected
            from commerce_negotiation.proposals proposal
            where case p_role
                when 'buyer' then proposal.buyer_cms_user_id = p_user_id
                when 'seller' then proposal.seller_cms_user_id = p_user_id
                else proposal.buyer_cms_user_id = p_user_id
                    or proposal.seller_cms_user_id = p_user_id
            end
              and (p_status is null or proposal.status = p_status)
              and (p_offer_id is null or proposal.commerce_offer_id = p_offer_id)
        ), page as (
            select filtered.*
            from filtered
            order by filtered.created_at desc
            limit v_limit offset v_offset
        )
        select jsonb_build_object(
            'items', coalesce(
                (select jsonb_agg(page.projected order by page.created_at desc) from page),
                '[]'::jsonb
            ),
            'total', (select count(*) from filtered)
        )
    );
end;
$$;
