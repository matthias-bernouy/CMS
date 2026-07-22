

create or replace function commerce.review_offer(
    p_offer_id bigint,
    p_action text,
    p_admin_id text,
    p_expected_version integer,
    p_minimum_amount bigint default null,
    p_maximum_amount bigint default null,
    p_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_settings commerce.settings%rowtype;
    v_proposal commerce.offer_price_proposals%rowtype;
    v_previous_state text;
    v_next_state text;
begin
    select * into v_settings from commerce.settings where id = 'default' for share;
    select seller.* into v_seller
    from commerce.sellers seller
    join commerce.offers offer on offer.seller_id = seller.id
    where offer.id = p_offer_id
    for share of seller;
    if not found then raise exception 'not_found: offer'; end if;
    select * into v_offer from commerce.offers where id = p_offer_id for update;
    if not found then raise exception 'not_found: offer'; end if;
    if v_offer.version is distinct from p_expected_version then raise exception 'conflict: stale offer version'; end if;
    if p_action not in ('pause', 'archive', 'reject') then
        if v_seller.verification_status in ('rejected', 'suspended') then raise exception 'forbidden: seller is not allowed to sell'; end if;
        if v_settings.mode = 'ecommerce' and v_seller.kind = 'user' then
            raise exception 'forbidden: marketplace offers are disabled';
        end if;
        perform commerce.assert_custom_fields('offer', v_offer.metadata, 'system');
    end if;
    v_previous_state := v_offer.workflow_state;

    if p_action in ('request_price', 'request_changes', 'approve', 'reject') then
        select to_state into v_next_state
        from commerce.offer_workflow_transitions
        where from_state = v_offer.workflow_state
          and action = p_action
          and actor_kind = 'admin';
        if not found then raise exception 'conflict: offer action is not allowed from the current state'; end if;
    elsif p_action = 'publish' then
        if exists (
            select 1 from commerce.offer_workflow_states
            where code = v_offer.workflow_state and phase = 'ready' and enabled
        ) then
            v_next_state := v_offer.workflow_state;
        else
            select to_state into v_next_state
            from commerce.offer_workflow_transitions
            where from_state = v_offer.workflow_state
              and action = 'approve'
              and actor_kind = 'admin';
            if not found then raise exception 'conflict: offer cannot be published from the current state'; end if;
        end if;
    elsif p_action not in ('pause', 'archive') then
        select to_state into v_next_state
        from commerce.offer_workflow_transitions
        where from_state = v_offer.workflow_state
          and action = p_action
          and actor_kind = 'admin';
        if not found then raise exception 'validation: unsupported offer review action'; end if;
    end if;

    if p_action <> 'pause' and not exists (
        select 1 from commerce.offer_workflow_states
        where code = v_next_state and enabled
    ) then raise exception 'conflict: target workflow state is disabled'; end if;

    if p_action = 'request_price' then
        if p_minimum_amount is null or p_maximum_amount is null
            or p_minimum_amount < 0 or p_maximum_amount < p_minimum_amount then
            raise exception 'validation: a valid minimum and maximum price are required';
        end if;
        if v_offer.workflow_state <> 'pending_review' then
            raise exception 'conflict: price can only be requested during review';
        end if;
        insert into commerce.offer_price_rules (
            offer_id, minimum_amount, maximum_amount, currency, configured_by
        ) values (
            v_offer.id, p_minimum_amount, p_maximum_amount, v_offer.currency,
            coalesce(nullif(p_admin_id, ''), 'cms-admin')
        ) on conflict (offer_id) do update
        set minimum_amount = excluded.minimum_amount,
            maximum_amount = excluded.maximum_amount,
            currency = excluded.currency,
            configured_by = excluded.configured_by;
    elsif p_action = 'request_changes' then
        null;
    elsif p_action in ('approve', 'publish') then
        select * into v_proposal
        from commerce.offer_price_proposals
        where offer_id = v_offer.id and status in ('pending', 'accepted')
        order by case when status = 'pending' then 0 else 1 end, created_at desc
        limit 1 for update;
        if v_offer.accepted_price_amount is null and not found then
            raise exception 'validation: an offer price must be approved first';
        end if;
        if found and v_proposal.status = 'pending' then
            update commerce.offer_price_proposals
            set status = 'superseded'
            where offer_id = v_offer.id and status = 'accepted' and id <> v_proposal.id;
            update commerce.offer_price_proposals
            set status = 'accepted', decided_by = coalesce(nullif(p_admin_id, ''), 'cms-admin'),
                decision_reason = p_reason, decided_at = now()
            where id = v_proposal.id;
            v_offer.accepted_price_amount := v_proposal.amount;
        end if;
    elsif p_action = 'reject' then
        update commerce.offer_price_proposals
        set status = 'rejected', decided_by = coalesce(nullif(p_admin_id, ''), 'cms-admin'),
            decision_reason = p_reason, decided_at = now()
        where offer_id = v_offer.id and status = 'pending';
    elsif p_action = 'pause' then
        update commerce.offers set publication_status = 'paused' where id = v_offer.id returning * into v_offer;
        v_next_state := v_offer.workflow_state;
    elsif p_action = 'archive' then
        v_next_state := 'archived';
    else
        -- Custom administrator actions use their configured transition.
        null;
    end if;

    if p_action <> 'pause' then
        if p_action in ('approve', 'publish') and not exists (
            select 1 from commerce.products
            where id = v_offer.product_id and status = 'active' and visibility = 'public'
        ) then
            raise exception 'validation: an active public product is required to publish an offer';
        end if;
        if p_action in ('approve', 'publish') and not exists (
            select 1 from commerce.offer_workflow_states
            where code = v_next_state and phase = 'ready' and enabled
        ) then
            raise exception 'validation: publication requires a ready workflow state';
        end if;
        if p_action in ('approve', 'publish') then
            perform commerce.assert_offer_publication_ready(
                v_offer.seller_id,
                v_offer.product_id,
                v_offer.variant_id,
                v_next_state,
                v_offer.accepted_price_amount
            );
        end if;
        update commerce.offers
        set workflow_state = v_next_state,
            accepted_price_amount = v_offer.accepted_price_amount,
            publication_status = case
                when p_action in ('approve', 'publish') then 'active'
                when p_action = 'reject' and publication_status = 'active' then 'paused'
                when p_action = 'archive' then 'archived'
                when publication_status = 'active' and not exists (
                    select 1 from commerce.offer_workflow_states
                    where code = v_next_state and phase = 'ready' and enabled
                ) then 'paused'
                else publication_status
            end
        where id = v_offer.id
        returning * into v_offer;
    end if;

    insert into commerce.offer_events (
        offer_id, event_type, actor_kind, actor_id, previous_workflow_state, next_workflow_state, data
    ) values (
        v_offer.id, p_action, 'admin', coalesce(nullif(p_admin_id, ''), 'cms-admin'),
        v_previous_state, v_next_state,
        jsonb_strip_nulls(jsonb_build_object(
            'minimumAmount', p_minimum_amount,
            'maximumAmount', p_maximum_amount,
            'reason', p_reason
        ))
    );
    return to_jsonb(v_offer);
end;
$$;