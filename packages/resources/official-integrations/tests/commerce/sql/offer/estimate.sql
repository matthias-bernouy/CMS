\set ON_ERROR_STOP on

begin;
set local role service_role;

do $$
declare
    v_product jsonb;
    v_result jsonb;
    v_seller_id bigint;
begin
    v_product := commerce.upsert_product(null, jsonb_build_object(
        'slug', 'estimate-product', 'title', 'Estimate product',
        'status', 'active', 'visibility', 'public'
    ));
    select id into v_seller_id from commerce.sellers where slug = 'default';

    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code, workflow_state,
        publication_status, accepted_price_amount, currency, availability
    ) values
        (v_seller_id, (v_product->>'id')::bigint, 'estimate-one', 'Estimate one', 'good', 'approved', 'archived', 10000, 'eur', 'unavailable'),
        (v_seller_id, (v_product->>'id')::bigint, 'estimate-two', 'Estimate two', 'good', 'approved', 'archived', 14000, 'eur', 'unavailable'),
        (v_seller_id, (v_product->>'id')::bigint, 'estimate-three', 'Estimate three', 'good', 'approved', 'archived', 18000, 'eur', 'unavailable');

    v_result := commerce.estimate_offer_price((v_product->>'id')::bigint, null, 'good');
    if v_result->>'available' <> 'true'
        or v_result->>'scope' <> 'product_and_condition'
        or (v_result->>'sampleSize')::integer <> 3
        or (v_result->>'observedMinimumAmount')::bigint <> 10000
        or (v_result->>'observedMaximumAmount')::bigint <> 18000
        or (v_result->>'medianAmount')::bigint <> 14000 then
        raise exception 'offer estimate smoke: unexpected aggregate %', v_result;
    end if;
end;
$$;

rollback;
