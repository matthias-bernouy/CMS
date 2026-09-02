do $fixture$
declare
    v_product jsonb;
    v_offer jsonb;
    v_offer_id bigint;
    v_offer_version integer;
begin
    v_product := commerce.upsert_product(
        null,
        pg_catalog.jsonb_build_object(
            'slug', 'seller-price-concurrency-product',
            'title', 'Seller price concurrency product',
            'status', 'active',
            'visibility', 'public'
        )
    );
    perform commerce.register_my_seller(
        'seller-price-concurrency-user',
        'Seller price concurrency user'
    );
    v_offer := commerce.create_my_offer(
        'seller-price-concurrency-user',
        pg_catalog.jsonb_build_object(
            'productId', (v_product->>'id')::bigint,
            'slug', 'seller-price-concurrency-offer',
            'title', 'Seller price concurrency offer',
            'conditionCode', 'very_good',
            'quantityAvailable', 1
        )
    );
    v_offer_id := (v_offer->>'id')::bigint;
    v_offer_version := (v_offer->>'version')::integer;
    v_offer := commerce.submit_my_offer(
        v_offer_id,
        'seller-price-concurrency-user',
        v_offer_version
    );
    v_offer := commerce.review_offer(
        v_offer_id,
        'request_price',
        'seller-price-concurrency-admin',
        (v_offer->>'version')::integer,
        11000,
        15000
    );
    insert into seller_price_submission_test.state (
        offer_id, expected_version, baseline_event_count
    ) values (
        v_offer_id,
        (v_offer->>'version')::integer,
        (
            select pg_catalog.count(*)
            from commerce.offer_events
            where offer_id = v_offer_id
        )
    );
end;
$fixture$;
