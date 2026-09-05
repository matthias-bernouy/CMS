
drop function if exists commerce.get_protected_seller_context(
    text, bigint[], bigint, text
);
drop function if exists commerce.get_protected_seller_context(
    text, bigint[], bigint, text, uuid
);

create function commerce.get_protected_seller_context(
    p_scope text,
    p_offer_ids bigint[],
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_price_agreement_public_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_buyer_cms_user_id text := nullif(
        pg_catalog.btrim(p_buyer_cms_user_id), ''
    );
    v_expected_offer_count integer;
    v_offer_count bigint;
    v_seller_count bigint;
    v_seller_id bigint;
    v_seller_cms_user_id text;
begin
    -- VOLATILE is deliberate: each SELECT keeps its READ COMMITTED snapshot,
    -- matching the two former PostgREST reads during identity revocation.
    if p_scope = 'checkout' then
        if p_order_id is not null
           or (
               (p_price_agreement_public_id is null and (
                   p_offer_ids is null
                   or pg_catalog.cardinality(p_offer_ids) = 0
                   or exists (
                       select 1
                       from pg_catalog.unnest(p_offer_ids) requested(offer_id)
                       where requested.offer_id is null or requested.offer_id < 1
                   )
               ))
               or (p_price_agreement_public_id is not null and p_offer_ids is not null)
           ) then
            return pg_catalog.jsonb_build_object('state', 'invalid_request');
        end if;
        if v_buyer_cms_user_id is null then
            return pg_catalog.jsonb_build_object('state', 'identity_required');
        end if;
        if p_price_agreement_public_id is not null then
            select agreement.seller_id
            into v_seller_id
            from commerce.price_agreements agreement
            where agreement.public_id = p_price_agreement_public_id
              and agreement.buyer_cms_user_id = v_buyer_cms_user_id
              and agreement.status in ('active', 'consumed');
            if not found then
                return pg_catalog.jsonb_build_object('state', 'agreement_not_found');
            end if;
        else
            v_expected_offer_count := pg_catalog.cardinality(p_offer_ids);
            select pg_catalog.count(*),
                pg_catalog.count(distinct offer.seller_id),
                pg_catalog.min(offer.seller_id)
            into v_offer_count, v_seller_count, v_seller_id
            from commerce.offers offer
            where offer.id = any(p_offer_ids);
            if v_offer_count <> v_expected_offer_count then
                return pg_catalog.jsonb_build_object('state', 'offer_not_found');
            end if;
            if v_seller_count <> 1 then
                return pg_catalog.jsonb_build_object('state', 'multiple_sellers');
            end if;
        end if;
    elsif p_scope = 'payment' then
        if p_offer_ids is not null
            or p_price_agreement_public_id is not null
            or p_order_id is null
            or p_order_id < 1 then
            return pg_catalog.jsonb_build_object('state', 'invalid_request');
        end if;
        if v_buyer_cms_user_id is null then
            return pg_catalog.jsonb_build_object('state', 'identity_required');
        end if;
        select order_row.seller_id
        into v_seller_id
        from commerce.orders order_row
        where order_row.id = p_order_id
          and order_row.buyer_cms_user_id = v_buyer_cms_user_id;
        if not found then
            return pg_catalog.jsonb_build_object('state', 'order_not_found');
        end if;
    else
        return pg_catalog.jsonb_build_object('state', 'invalid_request');
    end if;

    select nullif(pg_catalog.btrim(seller.cms_user_id), '')
    into v_seller_cms_user_id
    from commerce.sellers seller
    where seller.id = v_seller_id and seller.kind = 'user';
    if not found or v_seller_cms_user_id is null then
        return pg_catalog.jsonb_build_object('state', 'seller_unavailable');
    end if;
    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'context', pg_catalog.jsonb_build_object(
            'seller_cms_user_id', v_seller_cms_user_id,
            'buyer_cms_user_id', v_buyer_cms_user_id
        )
    );
end;
$$;

revoke execute on function commerce.get_protected_seller_context(
    text, bigint[], bigint, text, uuid
) from public, anon, authenticated;
grant execute on function commerce.get_protected_seller_context(
    text, bigint[], bigint, text, uuid
) to service_role;
