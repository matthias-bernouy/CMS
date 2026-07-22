

create or replace function commerce.respond_marketplace_claim(
    p_claim_id bigint,
    p_seller_cms_user_id text,
    p_message text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_claim commerce.marketplace_claims%rowtype;
begin
    select claim.* into v_claim
    from commerce.marketplace_claims claim
    join commerce.sellers seller on seller.id = claim.seller_id
    where claim.id = p_claim_id and seller.cms_user_id = p_seller_cms_user_id
    for update of claim;
    if not found then raise exception 'not_found: claim'; end if;
    if v_claim.version is distinct from p_expected_version then raise exception 'conflict: stale claim version'; end if;
    if v_claim.status not in ('open', 'awaiting_seller_response') then
        raise exception 'conflict: claim no longer accepts a seller response';
    end if;
    update commerce.marketplace_claims set status = 'under_review'
    where id = v_claim.id returning * into v_claim;
    insert into commerce.marketplace_claim_events (
        claim_id, event_type, actor_kind, actor_id, message
    ) values (v_claim.id, 'seller_responded', 'seller', p_seller_cms_user_id, p_message);
    perform commerce.append_financial_event(
        v_claim.order_id, 'marketplace_claim', v_claim.id::text, 'claim_seller_responded',
        'seller', p_seller_cms_user_id, null, '{}'::jsonb,
        'commerce.claim.seller_responded', 'claim:' || v_claim.id || ':seller-response:' || v_claim.version
    );
    return to_jsonb(v_claim);
end;
$$;