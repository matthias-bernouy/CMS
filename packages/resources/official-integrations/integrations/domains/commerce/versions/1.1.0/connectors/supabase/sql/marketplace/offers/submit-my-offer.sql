

create or replace function commerce.submit_my_offer(
    p_offer_id bigint,
    p_cms_user_id text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_settings commerce.settings%rowtype;
    v_previous_state text;
    v_next_state text;
begin
    select * into v_settings from commerce.settings where id = 'default' for share;
    if v_settings.mode = 'ecommerce' then raise exception 'forbidden: marketplace offers are disabled'; end if;
    select * into v_seller from commerce.sellers where cms_user_id = p_cms_user_id for share;
    if not found then raise exception 'not_found: seller'; end if;
    select * into v_offer from commerce.offers
    where id = p_offer_id and seller_id = v_seller.id
    for update;
    if not found then raise exception 'not_found: offer'; end if;
    if v_offer.version is distinct from p_expected_version then raise exception 'conflict: stale offer version'; end if;
    perform commerce.assert_custom_fields('offer', v_offer.metadata, 'system');
    if v_seller.verification_status in ('rejected', 'suspended') then raise exception 'forbidden: seller is not allowed to sell'; end if;
    if (
        select count(*) from commerce.offer_media where offer_id = v_offer.id
    ) not between v_settings.offer_image_min_count and v_settings.offer_image_max_count then
        raise exception 'validation: an offer must have between % and % images',
            v_settings.offer_image_min_count,
            v_settings.offer_image_max_count;
    end if;

    if v_settings.price_policy = 'free' and not exists (
        select 1 from commerce.offer_price_proposals
        where offer_id = v_offer.id and status in ('pending', 'accepted')
    ) and v_offer.accepted_price_amount is null then
        raise exception 'validation: submit a price before submitting this offer';
    end if;

    select to_state into v_next_state
    from commerce.offer_workflow_transitions
    where from_state = v_offer.workflow_state and action = 'submit' and actor_kind = 'seller';
    if not found then raise exception 'conflict: offer cannot be submitted from the current state'; end if;

    v_previous_state := v_offer.workflow_state;
    update commerce.offers set workflow_state = v_next_state where id = v_offer.id returning * into v_offer;
    insert into commerce.offer_events (
        offer_id, event_type, actor_kind, actor_id, previous_workflow_state, next_workflow_state
    ) values (v_offer.id, 'submitted', 'seller', p_cms_user_id, v_previous_state, v_next_state);
    return to_jsonb(v_offer);
end;
$$;
