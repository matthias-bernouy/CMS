

create or replace function commerce.update_my_offer(
    p_offer_id bigint,
    p_cms_user_id text,
    p_expected_version integer,
    p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_settings commerce.settings%rowtype;
    v_metadata jsonb;
    v_metadata_patch jsonb;
    v_details_editable boolean;
begin
    select * into v_settings from commerce.settings where id = 'default' for share;
    if v_settings.mode = 'ecommerce' then raise exception 'forbidden: marketplace offers are disabled'; end if;
    select * into v_seller from commerce.sellers where cms_user_id = p_cms_user_id for share;
    if not found then raise exception 'not_found: seller'; end if;
    if v_seller.verification_status in ('rejected', 'suspended') then raise exception 'forbidden: seller is not allowed to sell'; end if;
    select * into v_offer from commerce.offers
    where id = p_offer_id and seller_id = v_seller.id
    for update;
    if not found then raise exception 'not_found: offer'; end if;
    if v_offer.version is distinct from p_expected_version then
        raise exception 'conflict: stale offer version';
    end if;
    if v_offer.publication_status = 'archived' then
        raise exception 'conflict: archived offers cannot be edited';
    end if;
    v_details_editable := v_offer.workflow_state in ('draft', 'changes_requested', 'awaiting_seller_price');
    if not v_details_editable and exists (
        select 1 from jsonb_object_keys(p_payload) key
        where key not in ('availability', 'quantityAvailable', 'publicationStatus')
    ) then
        raise exception 'conflict: only inventory and pause can be changed in the current workflow state';
    end if;
    if p_payload ? 'publicationStatus' and (
        p_payload->>'publicationStatus' <> 'paused' or v_offer.publication_status <> 'active'
    ) then
        raise exception 'conflict: a seller can only pause an active offer';
    end if;
    if p_payload ? 'metadata' then
        v_metadata_patch := p_payload->'metadata';
        perform commerce.assert_custom_field_patch('offer', v_metadata_patch, 'self');
        v_metadata := v_offer.metadata || v_metadata_patch;
    else
        v_metadata := v_offer.metadata;
    end if;
    perform commerce.assert_custom_fields('offer', v_metadata, 'system');
    if not exists (
        select 1 from commerce.offer_conditions
        where code = coalesce(nullif(p_payload->>'conditionCode', ''), v_offer.condition_code) and enabled
    ) then
        raise exception 'validation: unsupported offer condition';
    end if;

    update commerce.offers
    set slug = coalesce(nullif(lower(btrim(p_payload->>'slug')), ''), slug),
        title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
        description = case when p_payload ? 'description' then nullif(btrim(p_payload->>'description'), '') else description end,
        condition_code = coalesce(nullif(p_payload->>'conditionCode', ''), condition_code),
        publication_status = case
            when p_payload->>'publicationStatus' = 'paused' then 'paused'
            else publication_status
        end,
        availability = case
            when p_payload ? 'quantityAvailable'
                and nullif(p_payload->>'quantityAvailable', '')::integer = 0 then 'unavailable'
            else coalesce(nullif(p_payload->>'availability', ''), availability)
        end,
        quantity_available = case when p_payload ? 'quantityAvailable' then nullif(p_payload->>'quantityAvailable', '')::integer else quantity_available end,
        inventory_revision = case
            when p_payload ? 'availability' or p_payload ? 'quantityAvailable' then inventory_revision + 1
            else inventory_revision
        end,
        metadata = v_metadata
    where id = p_offer_id
    returning * into v_offer;

    insert into commerce.offer_events (offer_id, event_type, actor_kind, actor_id, data)
    values (
        v_offer.id,
        case
            when p_payload->>'publicationStatus' = 'paused' then 'paused'
            when not v_details_editable then 'inventory_updated'
            else 'details_updated'
        end,
        'seller', p_cms_user_id, '{}'::jsonb
    );
    return to_jsonb(v_offer);
end;
$$;