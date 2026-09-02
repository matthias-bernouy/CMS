\set ON_ERROR_STOP on

begin;
set local role service_role;

do $$
declare
    v_product jsonb;
    v_seller jsonb;
    v_offer jsonb;
    v_order jsonb;
    v_first_media jsonb;
    v_second_media jsonb;
    v_replacement jsonb;
    v_variant_id bigint;
    v_axes jsonb := '[
        {"key":"color","label":"Color","position":0,"values":[
            {"key":"red","label":"Red","position":0},
            {"key":"blue","label":"Blue","position":1}
        ]},
        {"key":"size","label":"Size","position":1,"values":[
            {"key":"s","label":"S","position":0},
            {"key":"m","label":"M","position":1},
            {"key":"l","label":"L","position":2}
        ]}
    ]'::jsonb;
    v_matrix jsonb := '[
        {"key":"color:red|size:s","title":"Color: Red / Size: S","position":0,"choices":[{"axisKey":"color","valueKey":"red"},{"axisKey":"size","valueKey":"s"}]},
        {"key":"color:red|size:m","title":"Color: Red / Size: M","position":1,"choices":[{"axisKey":"color","valueKey":"red"},{"axisKey":"size","valueKey":"m"}]},
        {"key":"color:red|size:l","title":"Color: Red / Size: L","position":2,"choices":[{"axisKey":"color","valueKey":"red"},{"axisKey":"size","valueKey":"l"}]},
        {"key":"color:blue|size:s","title":"Color: Blue / Size: S","position":3,"choices":[{"axisKey":"color","valueKey":"blue"},{"axisKey":"size","valueKey":"s"}]},
        {"key":"color:blue|size:m","title":"Color: Blue / Size: M","position":4,"choices":[{"axisKey":"color","valueKey":"blue"},{"axisKey":"size","valueKey":"m"}]},
        {"key":"color:blue|size:l","title":"Color: Blue / Size: L","position":5,"choices":[{"axisKey":"color","valueKey":"blue"},{"axisKey":"size","valueKey":"l"}]}
    ]'::jsonb;
begin
    v_product := commerce.upsert_product(null, jsonb_build_object(
        'slug', 'aggregate-racket', 'title', 'Aggregate racket',
        'status', 'active', 'visibility', 'public',
        'variantAxes', v_axes, 'variantMatrix', v_matrix
    ));
    if (select count(*) from commerce.product_variants where product_id = (v_product->>'id')::bigint) <> 6 then
        raise exception 'aggregate smoke: expected six generated variants';
    end if;

    v_seller := commerce.register_my_seller('aggregate-seller', 'Aggregate seller');
    v_seller := commerce.review_seller((v_seller->>'id')::bigint, 'verified', 'smoke-admin', null, 1);
    begin
        perform commerce.upsert_offer(null, jsonb_build_object(
            'sellerId', v_seller->>'id', 'productId', v_product->>'id',
            'slug', 'missing-variant', 'title', 'Missing variant'
        ));
        raise exception 'aggregate smoke: offer without variant was accepted';
    exception when others then
        if sqlerrm = 'aggregate smoke: offer without variant was accepted'
            or sqlerrm not like 'validation: a product variant is required%' then raise; end if;
    end;

    select id into v_variant_id from commerce.product_variants
    where product_id = (v_product->>'id')::bigint and combination_key = 'color:red|size:m';
    v_offer := commerce.upsert_offer(null, jsonb_build_object(
        'sellerId', v_seller->>'id', 'productId', v_product->>'id', 'variantId', v_variant_id,
        'slug', 'aggregate-offer', 'title', 'Aggregate offer', 'workflowState', 'approved',
        'publicationStatus', 'active', 'acceptedPriceAmount', 12000
    ));
    v_order := commerce.create_order_from_offers(
        'aggregate-buyer', 'aggregate-checkout',
        jsonb_build_array(jsonb_build_object('offerId', v_offer->>'id', 'quantity', 1))
    );
    if (select variant_snapshot->>'combinationKey' from commerce.order_lines
        where order_id = (v_order->>'id')::bigint) <> 'color:red|size:m'
        or (select jsonb_array_length(variant_snapshot->'options') from commerce.order_lines
            where order_id = (v_order->>'id')::bigint) <> 2 then
        raise exception 'aggregate smoke: order variant snapshot is incomplete';
    end if;

    perform commerce.upsert_product((v_product->>'id')::bigint, jsonb_build_object(
        'variantAxes', '[{"key":"color","label":"Color","position":0,"values":[{"key":"blue","label":"Blue","position":0}]}]'::jsonb,
        'variantMatrix', '[{"key":"color:blue","title":"Color: Blue","position":0,"choices":[{"axisKey":"color","valueKey":"blue"}]}]'::jsonb
    ), (v_product->>'version')::integer);
    if (select publication_status from commerce.offers where id = (v_offer->>'id')::bigint) <> 'paused' then
        raise exception 'aggregate smoke: stale variant offer was not paused';
    end if;

    v_first_media := commerce.attach_product_media(
        (v_product->>'id')::bigint, 'commerce-media', 'products/aggregate/one.webp',
        'image/webp', 100, 'one.webp', null
    );
    v_second_media := commerce.attach_product_media(
        (v_product->>'id')::bigint, 'commerce-media', 'products/aggregate/two.webp',
        'image/webp', 120, 'two.webp', null
    );
    perform commerce.reorder_product_media((v_product->>'id')::bigint, jsonb_build_array(
        (v_second_media->>'media_id')::bigint, (v_first_media->>'media_id')::bigint
    ));
    if not (select is_main from commerce.product_media where media_id = (v_second_media->>'media_id')::bigint) then
        raise exception 'aggregate smoke: reordered image is not main';
    end if;
    v_replacement := commerce.attach_product_media(
        (v_product->>'id')::bigint, 'commerce-media', 'products/aggregate/replacement.webp',
        'image/webp', 140, 'replacement.webp', (v_second_media->>'media_id')::bigint
    );
    perform commerce.remove_product_media(
        (v_product->>'id')::bigint, (v_replacement->>'media_id')::bigint
    );
    if not (select is_main from commerce.product_media where media_id = (v_first_media->>'media_id')::bigint) then
        raise exception 'aggregate smoke: remaining image is not main';
    end if;
end;
$$;

rollback;
