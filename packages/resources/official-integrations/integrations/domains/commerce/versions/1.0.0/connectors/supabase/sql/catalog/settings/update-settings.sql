

create or replace function commerce.update_settings(
    p_payload jsonb,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
begin
    select * into v_settings from commerce.settings where id = 'default' for update;
    if v_settings.version is distinct from p_expected_version then
        raise exception 'conflict: stale settings version';
    end if;
    update commerce.settings
    set mode = coalesce(nullif(p_payload->>'mode', ''), mode),
        default_currency = coalesce(nullif(lower(p_payload->>'defaultCurrency'), ''), default_currency),
        require_verified_seller = coalesce((p_payload->>'requireVerifiedSeller')::boolean, require_verified_seller),
        offer_moderation = coalesce(nullif(p_payload->>'offerModeration', ''), offer_moderation),
        price_policy = coalesce(nullif(p_payload->>'pricePolicy', ''), price_policy),
        auto_approve_price_in_range = coalesce((p_payload->>'autoApprovePriceInRange')::boolean, auto_approve_price_in_range),
        require_final_price_approval = coalesce((p_payload->>'requireFinalPriceApproval')::boolean, require_final_price_approval),
        seller_can_publish = coalesce((p_payload->>'sellerCanPublish')::boolean, seller_can_publish)
    where id = 'default'
    returning * into v_settings;

    if v_settings.mode = 'ecommerce' then
        update commerce.offers offer
        set publication_status = 'paused'
        from commerce.sellers seller
        where seller.id = offer.seller_id
          and seller.kind = 'user'
          and offer.publication_status = 'active';
    end if;
    return to_jsonb(v_settings);
end;
$$;