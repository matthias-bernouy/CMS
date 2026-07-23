

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
    v_enable_whole_unit_prices boolean;
begin
    select * into v_settings from commerce.settings where id = 'default' for update;
    if v_settings.version is distinct from p_expected_version then
        raise exception 'conflict: stale settings version';
    end if;
    v_enable_whole_unit_prices := coalesce(
        (p_payload->>'wholeUnitPrices')::boolean,
        v_settings.whole_unit_prices
    );
    if v_enable_whole_unit_prices and not v_settings.whole_unit_prices and (
        exists (
            select 1 from commerce.offers
            where publication_status <> 'archived'
              and accepted_price_amount is not null
              and mod(accepted_price_amount, 100) <> 0
        )
        or exists (
            select 1
            from commerce.offer_price_rules rule
            join commerce.offers offer on offer.id = rule.offer_id
            where offer.publication_status <> 'archived'
              and (mod(rule.minimum_amount, 100) <> 0 or mod(rule.maximum_amount, 100) <> 0)
        )
        or exists (
            select 1
            from commerce.offer_price_proposals proposal
            join commerce.offers offer on offer.id = proposal.offer_id
            where offer.publication_status <> 'archived'
              and proposal.status in ('pending', 'accepted')
              and mod(proposal.amount, 100) <> 0
        )
    ) then
        raise exception 'conflict: non-whole offer prices must be resolved before enabling whole-unit prices';
    end if;
    update commerce.settings
    set mode = coalesce(nullif(p_payload->>'mode', ''), mode),
        default_currency = coalesce(nullif(lower(p_payload->>'defaultCurrency'), ''), default_currency),
        require_verified_seller = coalesce((p_payload->>'requireVerifiedSeller')::boolean, require_verified_seller),
        offer_moderation = coalesce(nullif(p_payload->>'offerModeration', ''), offer_moderation),
        price_policy = coalesce(nullif(p_payload->>'pricePolicy', ''), price_policy),
        whole_unit_prices = v_enable_whole_unit_prices,
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
