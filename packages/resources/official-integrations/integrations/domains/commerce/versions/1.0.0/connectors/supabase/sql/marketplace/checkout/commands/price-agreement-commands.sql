drop function if exists commerce.register_price_agreement(
    text, text, bigint, text, text, bigint, text, integer, timestamptz
);

create or replace function commerce.register_price_agreement(
    p_authority_key text,
    p_authority_reference text,
    p_authority_version integer,
    p_offer_id bigint,
    p_seller_cms_user_id text,
    p_buyer_cms_user_id text,
    p_unit_amount bigint,
    p_currency text,
    p_quantity integer,
    p_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_existing commerce.price_agreements%rowtype;
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_agreement commerce.price_agreements%rowtype;
    v_event_id bigint;
begin
    if p_authority_key is null
        or p_authority_key !~ '^[a-z][a-z0-9_.-]{1,79}$'
        or p_authority_reference is null
        or btrim(p_authority_reference) = ''
        or length(p_authority_reference) > 200 then
        raise exception 'validation: price agreement authority is invalid';
    end if;
    if p_authority_version is null or p_authority_version <= 0 then
        raise exception 'validation: price agreement authority version must be positive';
    end if;
    if p_buyer_cms_user_id is null or btrim(p_buyer_cms_user_id) = '' then
        raise exception 'validation: price agreement buyer is required';
    end if;
    if p_quantity is null or p_quantity not between 1 and 1000 then
        raise exception 'validation: price agreement quantity is invalid';
    end if;
    if p_unit_amount is null
        or p_unit_amount < 0
        or p_unit_amount::numeric * p_quantity > 9007199254740991 then
        raise exception 'validation: price agreement subtotal exceeds the supported maximum';
    end if;
    if p_expires_at is null or p_expires_at <= now() then
        raise exception 'validation: price agreement expiry must be in the future';
    end if;
    perform commerce.assert_offer_price_increment(p_unit_amount, 'agreed price');
    perform pg_advisory_xact_lock(hashtextextended(
        'commerce.price-agreement:' || p_authority_key || ':' || p_authority_reference, 0
    ));
    select * into v_existing
    from commerce.price_agreements
    where authority_key = p_authority_key
      and authority_reference = p_authority_reference;
    if found then
        if v_existing.offer_id is distinct from p_offer_id
            or v_existing.authority_version is distinct from p_authority_version
            or v_existing.buyer_cms_user_id is distinct from p_buyer_cms_user_id
            or v_existing.unit_amount is distinct from p_unit_amount
            or v_existing.currency is distinct from lower(p_currency)
            or v_existing.quantity is distinct from p_quantity then
            raise exception 'conflict: price agreement authority was reused with different terms';
        end if;
        return to_jsonb(v_existing) || jsonb_build_object('idempotent_replay', true);
    end if;
    perform commerce.expire_price_agreements(p_offer_id);
    select * into v_offer
    from commerce.offers
    where id = p_offer_id
    for update;
    if not found then raise exception 'not_found: offer'; end if;
    select * into v_seller
    from commerce.sellers
    where id = v_offer.seller_id
    for share;
    if v_seller.cms_user_id is distinct from p_seller_cms_user_id then
        raise exception 'forbidden: price agreement seller does not own the offer';
    end if;
    if p_buyer_cms_user_id = p_seller_cms_user_id then
        raise exception 'forbidden: sellers cannot buy their own offer';
    end if;
    if v_offer.currency is distinct from lower(p_currency) then
        raise exception 'conflict: price agreement currency does not match the offer';
    end if;
    if v_offer.publication_status <> 'active'
        or v_offer.availability <> 'available'
        or not exists (
            select 1 from commerce.offer_workflow_states state
            where state.code = v_offer.workflow_state
              and state.phase = 'ready'
              and state.enabled
        ) then
        raise exception 'conflict: offer is not available for a price agreement';
    end if;
    if v_offer.quantity_available is not null
        and v_offer.quantity_available < p_quantity then
        raise exception 'conflict: insufficient quantity for the price agreement';
    end if;
    if not exists (
        select 1 from commerce.products product
        where product.id = v_offer.product_id
          and product.status = 'active'
          and product.visibility = 'public'
    ) then
        raise exception 'conflict: price agreement product is not sellable';
    end if;
    perform commerce.assert_product_variant_ready(v_offer.product_id, v_offer.variant_id);
    perform commerce.assert_required_seller_sale_capabilities(v_seller.id);
    if commerce.offer_has_active_price_agreement(v_offer.id) then
        raise exception 'conflict: offer already has an active price agreement';
    end if;

    insert into commerce.price_agreements (
        authority_key, authority_reference, authority_version, offer_id, seller_id,
        buyer_cms_user_id, unit_amount, currency, quantity, expires_at
    ) values (
        p_authority_key, p_authority_reference, p_authority_version, v_offer.id, v_seller.id,
        p_buyer_cms_user_id, p_unit_amount, lower(p_currency), p_quantity, p_expires_at
    ) returning * into v_agreement;

    if coalesce((
        select configuration.mode
        from commerce.notification_configuration configuration
        where configuration.id = 'default'
    ), 'builtin') <> 'disabled' then
        insert into commerce.notification_events (
            event_key, contract_version, event_type, aggregate_type,
            aggregate_id, aggregate_version, occurred_at, payload
        ) values (
            'commerce.price_agreement.accepted:' || v_agreement.public_id,
            1, 'commerce.price_agreement.accepted', 'price_agreement',
            v_agreement.id::text, v_agreement.authority_version, now(),
            jsonb_build_object(
                'agreementId', v_agreement.public_id,
                'agreementVersion', v_agreement.authority_version,
                'offerId', v_offer.id,
                'offerSlug', v_offer.slug,
                'offerTitle', v_offer.title,
                'amountMinor', v_agreement.unit_amount,
                'currency', upper(v_agreement.currency),
                'checkoutExpiresAt', v_agreement.expires_at,
                'actionPath', '/checkout?agreementId=' || v_agreement.public_id::text
            )
        )
        on conflict (event_key) do update set event_key = excluded.event_key
        returning id into v_event_id;
        insert into commerce.notification_deliveries (
            event_id, rule_key, recipient_cms_user_id
        )
        select v_event_id, rule.key, v_agreement.buyer_cms_user_id
        from commerce.notification_rules rule
        where rule.event_type = 'commerce.price_agreement.accepted'
          and rule.enabled
        on conflict (event_id, rule_key, recipient_cms_user_id, channel) do nothing;
    end if;
    return to_jsonb(v_agreement) || jsonb_build_object('idempotent_replay', false);
end;
$$;

create or replace function commerce.cancel_price_agreement(
    p_authority_key text,
    p_authority_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_agreement commerce.price_agreements%rowtype;
begin
    select * into v_agreement
    from commerce.price_agreements
    where authority_key = p_authority_key
      and authority_reference = p_authority_reference
    for update;
    if not found then raise exception 'not_found: price agreement'; end if;
    if v_agreement.status = 'consumed' then
        raise exception 'conflict: consumed price agreements cannot be canceled';
    end if;
    if v_agreement.status = 'active' and v_agreement.expires_at <= now() then
        update commerce.price_agreements
        set status = 'expired'
        where id = v_agreement.id
        returning * into v_agreement;
    elsif v_agreement.status = 'active' then
        update commerce.price_agreements
        set status = 'canceled', canceled_at = now()
        where id = v_agreement.id
        returning * into v_agreement;
    end if;
    return to_jsonb(v_agreement);
end;
$$;

revoke execute on function commerce.register_price_agreement(
    text, text, integer, bigint, text, text, bigint, text, integer, timestamptz
) from public, anon, authenticated;
revoke execute on function commerce.cancel_price_agreement(text, text)
from public, anon, authenticated;
