

create or replace function commerce.submit_offer_price(
    p_offer_id bigint,
    p_cms_user_id text,
    p_amount bigint,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_rule commerce.offer_price_rules%rowtype;
    v_proposal commerce.offer_price_proposals%rowtype;
    v_previous_state text;
    v_next_state text;
    v_transition_state text;
    v_rule_exists boolean;
    v_accept boolean;
begin
    if p_amount is null or p_amount < 0 then raise exception 'validation: price must be non-negative'; end if;
    select * into v_settings from commerce.settings where id = 'default' for share;
    perform commerce.assert_offer_price_increment(p_amount, 'price');
    if v_settings.mode = 'ecommerce' then raise exception 'forbidden: marketplace offers are disabled'; end if;
    select * into v_seller from commerce.sellers where cms_user_id = p_cms_user_id for share;
    if not found then raise exception 'not_found: seller'; end if;
    if v_seller.verification_status in ('rejected', 'suspended') then raise exception 'forbidden: seller is not allowed to sell'; end if;
    perform commerce.assert_required_seller_sale_capabilities(v_seller.id);
    select * into v_offer from commerce.offers
    where id = p_offer_id and seller_id = v_seller.id
    for update;
    if not found then raise exception 'not_found: offer'; end if;
    if v_offer.version is distinct from p_expected_version then raise exception 'conflict: stale offer version'; end if;
    if not exists (
        select 1 from commerce.products
        where id = v_offer.product_id and status = 'active' and visibility = 'public'
    ) then raise exception 'conflict: offer product is not sellable'; end if;
    if v_offer.variant_id is not null and not exists (
        select 1 from commerce.product_variants
        where id = v_offer.variant_id and product_id = v_offer.product_id and status = 'active'
    ) then raise exception 'conflict: offer variant is not sellable'; end if;

    select * into v_rule from commerce.offer_price_rules where offer_id = v_offer.id for update;
    v_rule_exists := found;
    if v_rule_exists then
        select to_state into v_transition_state
        from commerce.offer_workflow_transitions
        where from_state = v_offer.workflow_state and action = 'submit_price' and actor_kind = 'seller';
        if not found then raise exception 'conflict: offer is not awaiting a seller price'; end if;
        if p_amount < v_rule.minimum_amount or p_amount > v_rule.maximum_amount then
            raise exception 'validation: price must be between % and %', v_rule.minimum_amount, v_rule.maximum_amount;
        end if;
    elsif v_settings.price_policy = 'admin_range' then
        raise exception 'conflict: administrator price range is missing';
    elsif v_offer.workflow_state not in ('draft', 'changes_requested', 'awaiting_seller_price') then
        raise exception 'conflict: price cannot be submitted in the current state';
    end if;

    update commerce.offer_price_proposals
    set status = 'superseded'
    where offer_id = v_offer.id and status = 'pending';

    v_accept := v_settings.auto_approve_price_in_range
        and not v_settings.require_final_price_approval
        and (v_rule_exists or v_settings.offer_moderation = 'none');
    if v_accept then
        update commerce.offer_price_proposals
        set status = 'superseded'
        where offer_id = v_offer.id and status = 'accepted';
    end if;
    insert into commerce.offer_price_proposals (
        offer_id, amount, currency, status, proposed_by, decided_by, decided_at
    ) values (
        v_offer.id,
        p_amount,
        v_offer.currency,
        case when v_accept then 'accepted' else 'pending' end,
        p_cms_user_id,
        case when v_accept then 'system' else null end,
        case when v_accept then now() else null end
    ) returning * into v_proposal;

    v_previous_state := v_offer.workflow_state;
    v_next_state := case
        when v_accept then 'approved'
        when v_rule_exists then v_transition_state
        when v_settings.offer_moderation = 'none' then 'awaiting_final_approval'
        else v_offer.workflow_state
    end;
    if v_accept and v_settings.seller_can_publish then
        perform commerce.assert_offer_publication_ready(
            v_offer.seller_id,
            v_offer.product_id,
            v_offer.variant_id,
            v_next_state,
            p_amount
        );
    end if;
    update commerce.offers
    set accepted_price_amount = case when v_accept then p_amount else accepted_price_amount end,
        workflow_state = v_next_state,
        publication_status = case
            when v_accept and v_settings.seller_can_publish then 'active'
            else publication_status
        end
    where id = v_offer.id
    returning * into v_offer;

    insert into commerce.offer_events (
        offer_id, event_type, actor_kind, actor_id, previous_workflow_state, next_workflow_state, data
    ) values (
        v_offer.id, 'price_submitted', 'seller', p_cms_user_id, v_previous_state, v_next_state,
        jsonb_build_object('proposalId', v_proposal.id, 'amount', p_amount, 'accepted', v_accept)
    );
    return jsonb_build_object('offer', to_jsonb(v_offer), 'proposal', to_jsonb(v_proposal));
end;
$$;
