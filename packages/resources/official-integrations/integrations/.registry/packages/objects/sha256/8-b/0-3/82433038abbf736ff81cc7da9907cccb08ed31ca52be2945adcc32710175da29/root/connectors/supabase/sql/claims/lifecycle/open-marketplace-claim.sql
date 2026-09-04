

create or replace function commerce.open_marketplace_claim(
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_reason text,
    p_description text,
    p_requested_amount bigint default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_claim commerce.marketplace_claims%rowtype;
begin
    select * into v_order from commerce.orders
    where id = p_order_id and buyer_cms_user_id = p_buyer_cms_user_id;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id for update;
    select * into v_fulfillment from commerce.order_fulfillments
    where order_id = v_order.id for update;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    select * into v_protection from commerce.protection_policies where id = v_terms.protection_policy_id;
    if v_fulfillment.status <> 'collected_by_recipient' or v_fulfillment.recipient_handoff_at is null then
        raise exception 'conflict: a marketplace claim requires trusted recipient handoff';
    end if;
    if v_fulfillment.claim_by_at is null or now() >= v_fulfillment.claim_by_at then
        raise exception 'conflict: marketplace claim window has closed';
    end if;
    if v_settlement.status in ('release_pending', 'reserve_held', 'released', 'reversal_pending', 'reversed', 'refunded') then
        raise exception 'conflict: settlement can no longer accept a standard marketplace claim';
    end if;
    if p_requested_amount is not null and (p_requested_amount < 0 or p_requested_amount > v_terms.buyer_total_amount) then
        raise exception 'validation: requested claim amount exceeds buyer total';
    end if;
    insert into commerce.marketplace_claims (
        order_id, buyer_cms_user_id, seller_id, reason, status, description,
        buyer_requested_amount, seller_response_by_at
    ) values (
        v_order.id, p_buyer_cms_user_id, v_order.seller_id, p_reason,
        'awaiting_seller_response', p_description, p_requested_amount,
        now() + make_interval(hours => v_protection.seller_response_hours)
    ) returning * into v_claim;
    update commerce.order_settlements set
        status = 'blocked', manual_review_reason = 'marketplace_claim_open'
    where order_id = v_order.id;
    insert into commerce.marketplace_claim_events (
        claim_id, event_type, actor_kind, actor_id, message
    ) values (v_claim.id, 'opened', 'buyer', p_buyer_cms_user_id, p_description);
    perform commerce.append_financial_event(
        v_order.id, 'marketplace_claim', v_claim.id::text, 'claim_opened',
        'buyer', p_buyer_cms_user_id, p_reason,
        jsonb_build_object('claimPublicId', v_claim.public_id, 'requestedAmount', p_requested_amount),
        'commerce.claim.opened', 'claim:' || v_claim.id || ':opened'
    );
    return to_jsonb(v_claim);
end;
$$;