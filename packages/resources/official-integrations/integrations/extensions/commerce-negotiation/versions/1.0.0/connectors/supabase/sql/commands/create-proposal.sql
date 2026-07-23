

drop function if exists commerce_negotiation.create_proposal(
    bigint, text, text, text, text, text, bigint, bigint, text, text
);

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
    p_buyer_message text default null,
    p_offer_main_image_media_id bigint default null
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
    v_whole_unit_prices boolean;
    v_authoritative jsonb;
    v_context jsonb;
begin
    perform commerce_negotiation.expire_pending_proposals();
    perform pg_advisory_xact_lock(hashtextextended(
        'commerce_negotiation.offer:' || p_offer_id::text, 0
    ));
    v_authoritative := commerce.lock_offer_negotiation_context(p_offer_id);
    if (v_authoritative ->> 'state') is distinct from 'ok' then
        raise exception 'conflict: offer is not available for negotiation';
    end if;
    v_context := v_authoritative -> 'context';
    if (v_context ->> 'offer_slug') is distinct from btrim(p_offer_slug)
        or (v_context ->> 'offer_title') is distinct from btrim(p_offer_title)
        or (v_context ->> 'seller_cms_user_id') is distinct from p_seller_cms_user_id
        or (v_context ->> 'seller_display_name') is distinct from p_seller_display_name
        or (v_context ->> 'reference_amount')::bigint is distinct from p_reference_amount
        or (v_context ->> 'currency') is distinct from lower(p_currency)
        or (v_context ->> 'offer_main_image_media_id')::bigint
            is distinct from p_offer_main_image_media_id then
        raise exception 'conflict: authoritative offer context changed';
    end if;
    select * into v_settings from commerce_negotiation.settings where id = 'default' for share;
    if not v_settings.enabled then raise exception 'conflict: price negotiation is disabled'; end if;
    if p_buyer_cms_user_id is null or btrim(p_buyer_cms_user_id) = '' then raise exception 'unauthorized: buyer identity required'; end if;
    if p_seller_cms_user_id = p_buyer_cms_user_id then raise exception 'forbidden: sellers cannot negotiate with themselves'; end if;
    if p_reference_amount is null or p_reference_amount <= 0 then raise exception 'validation: reference price must be positive'; end if;
    if p_offer_main_image_media_id is not null and p_offer_main_image_media_id <= 0 then
        raise exception 'validation: offer main image media id must be positive';
    end if;
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
    select whole_unit_prices into v_whole_unit_prices
    from commerce.settings
    where id = 'default';
    if not found then raise exception 'conflict: commerce settings are missing'; end if;
    if v_whole_unit_prices then
        v_minimum := ((v_minimum + 99) / 100) * 100;
        v_maximum := (v_maximum / 100) * 100;
    end if;
    perform commerce.assert_offer_price_increment(p_proposed_amount, 'proposed price');
    if p_proposed_amount < v_minimum or p_proposed_amount > v_maximum then
        raise exception 'validation: proposed amount must be between % and %', v_minimum, v_maximum;
    end if;

    begin
        insert into commerce_negotiation.proposals (
            commerce_offer_id, commerce_offer_slug, commerce_offer_title, offer_main_image_media_id,
            seller_cms_user_id, seller_display_name, buyer_cms_user_id,
            reference_amount, minimum_amount, maximum_amount, proposed_amount,
            currency, buyer_message, expires_at
        ) values (
            p_offer_id, btrim(p_offer_slug), btrim(p_offer_title), p_offer_main_image_media_id,
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
    return commerce_negotiation.project_proposal(v_proposal);
end;
$$;
