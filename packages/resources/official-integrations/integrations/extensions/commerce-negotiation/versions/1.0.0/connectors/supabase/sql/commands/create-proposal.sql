

create or replace function commerce_negotiation.create_proposal(
    p_offer_id bigint,
    p_offer_slug text,
    p_offer_title text,
    p_seller_cms_user_id text,
    p_seller_display_name text,
    p_buyer_cms_user_id text,
    p_reference_amount bigint,
    p_proposed_amount bigint,
    p_currency text,
    p_buyer_message text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce_negotiation.settings%rowtype;
    v_proposal commerce_negotiation.proposals%rowtype;
    v_minimum bigint;
    v_maximum bigint;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select * into v_settings from commerce_negotiation.settings where id = 'default' for share;
    if not v_settings.enabled then raise exception 'conflict: price negotiation is disabled'; end if;
    if p_buyer_cms_user_id is null or btrim(p_buyer_cms_user_id) = '' then raise exception 'unauthorized: buyer identity required'; end if;
    if p_seller_cms_user_id = p_buyer_cms_user_id then raise exception 'forbidden: sellers cannot negotiate with themselves'; end if;
    if p_reference_amount is null or p_reference_amount <= 0 then raise exception 'validation: reference price must be positive'; end if;
    perform pg_advisory_xact_lock(hashtextextended('commerce_negotiation.offer:' || p_offer_id::text, 0));
    if exists (
        select 1 from commerce_negotiation.proposals
        where commerce_offer_id = p_offer_id and status = 'accepted'
    ) then
        raise exception 'conflict: this offer already has an accepted proposal';
    end if;
    v_minimum := ceil(
        p_reference_amount::numeric * v_settings.minimum_ratio_bps::numeric / 10000
    )::bigint;
    v_maximum := floor(
        p_reference_amount::numeric * v_settings.maximum_ratio_bps::numeric / 10000
    )::bigint;
    if p_proposed_amount < v_minimum or p_proposed_amount > v_maximum then
        raise exception 'validation: proposed amount must be between % and %', v_minimum, v_maximum;
    end if;

    begin
        insert into commerce_negotiation.proposals (
            commerce_offer_id, commerce_offer_slug, commerce_offer_title,
            seller_cms_user_id, seller_display_name, buyer_cms_user_id,
            reference_amount, minimum_amount, maximum_amount, proposed_amount,
            currency, buyer_message, expires_at
        ) values (
            p_offer_id, btrim(p_offer_slug), btrim(p_offer_title),
            p_seller_cms_user_id, coalesce(nullif(btrim(p_seller_display_name), ''), 'Seller'), p_buyer_cms_user_id,
            p_reference_amount, v_minimum, v_maximum, p_proposed_amount,
            lower(p_currency), nullif(btrim(p_buyer_message), ''),
            now() + make_interval(hours => v_settings.proposal_ttl_hours)
        ) returning * into v_proposal;
    exception when unique_violation then
        raise exception 'conflict: a pending proposal already exists for this buyer and offer';
    end;

    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, next_status,
        data
    ) values (
        v_proposal.id, 'created', 'buyer', p_buyer_cms_user_id, 'pending',
        jsonb_build_object('amount', p_proposed_amount, 'referenceAmount', p_reference_amount)
    );
    return to_jsonb(v_proposal);
end;
$$;