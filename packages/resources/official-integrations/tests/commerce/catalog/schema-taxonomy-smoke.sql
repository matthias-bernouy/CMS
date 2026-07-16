\set ON_ERROR_STOP on

begin;
set local role service_role;

select (commerce.upsert_brand(null, '{"slug":"smoke-brand","name":"Smoke brand"}'::jsonb)->>'id')::bigint brand_id \gset
select (commerce.upsert_category(null, '{"slug":"rackets","label":"Rackets"}'::jsonb)->>'id')::bigint root_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'parentId', :root_id, 'slug', 'tennis', 'label', 'Tennis'
))->>'id')::bigint category_id \gset

select commerce.upsert_custom_field(
    'product', 'weight', 'Weight', 'number', '[]'::jsonb,
    false, false, true, true, true, 0, true, 'g'
);
select commerce.upsert_category_custom_field(
    :root_id, 'weight', false, true, 10, 'kg', '["eq"]'::jsonb
);
select commerce.upsert_custom_field(
    'product', 'grip', 'Grip', 'enum', '["L1","L2"]'::jsonb,
    false, false, true, true, true
);
select commerce.upsert_category_custom_field(
    :category_id, 'grip', true, true, 20, null, '["eq","in"]'::jsonb
);
select (commerce.upsert_product(null, jsonb_build_object(
    'slug', 'taxonomy-racket', 'title', 'Taxonomy racket',
    'brandId', :brand_id, 'primaryCategoryId', :category_id,
    'status', 'active', 'visibility', 'public',
    'metadata', jsonb_build_object('weight', 300),
    'variantAxes', '[{
        "key":"grip","fieldKey":"grip","label":"Grip","position":0,
        "values":[
            {"key":"l1","label":"L1","value":"L1","position":0},
            {"key":"l2","label":"L2","value":"L2","position":1}
        ]
    }]'::jsonb,
    'variantMatrix', '[
        {"key":"grip:l1","title":"Grip: L1","status":"active","position":0,"choices":[{"axisKey":"grip","valueKey":"l1"}]},
        {"key":"grip:l2","title":"Grip: L2","status":"active","position":1,"choices":[{"axisKey":"grip","valueKey":"l2"}]}
    ]'::jsonb
))->>'id')::bigint product_id \gset

-- Product metadata is a complete dashboard value. When a field becomes a variant
-- axis, a subsequent save must remove the obsolete Product-level value.
update commerce.products
set metadata = metadata || '{"grip":"L1"}'::jsonb
where id = :product_id;
select commerce.upsert_product(
    :product_id,
    '{"metadata":{"weight":300}}'::jsonb,
    (select version from commerce.products where id = :product_id)
);
do $$
begin
    if (select metadata ? 'grip' from commerce.products where slug = 'taxonomy-racket') then
        raise exception 'taxonomy smoke: variant axis metadata remained stored on the product';
    end if;
end;
$$;

select id variant_id from commerce.product_variants
where product_id = :product_id and combination_key = 'grip:l1' \gset

insert into commerce.sellers (
    kind, slug, display_name, verification_status, verified_at, verified_by
)
values ('external', 'taxonomy-seller', 'Taxonomy seller', 'verified', now(), 'smoke-admin')
returning id as seller_id \gset
insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability, quantity_available
) values (
    :seller_id, :product_id, :variant_id, 'taxonomy-offer', 'Taxonomy offer', 'very_good',
    'active', 'approved', 12000, 'eur', 'available', 1
);

insert into commerce.offers (
    seller_id, product_id, variant_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability, quantity_available
) values (
    :seller_id, :product_id, :variant_id, 'taxonomy-sold-offer', 'Taxonomy sold offer', 'very_good',
    'active', 'approved', 11000, 'eur', 'unavailable', 0
);

do $$
declare matching jsonb;
declare excluded jsonb;
declare weight_filter jsonb;
begin
    if not exists (select 1 from commerce.categories where full_slug = 'rackets/tennis') then
        raise exception 'taxonomy smoke: hierarchical slug was not computed';
    end if;
    if not exists (
        select 1
        from jsonb_array_elements(commerce.category_custom_field_schema(
            (select id from commerce.categories where full_slug = 'rackets/tennis')
        )->'fields') field
        where field->>'fieldKey' = 'weight' and (field->>'inherited')::boolean
    ) then
        raise exception 'taxonomy smoke: inherited category metadata was not resolved';
    end if;
    select field into weight_filter
    from jsonb_array_elements(commerce.offer_filter_schema('rackets/tennis')->'fields') field
    where field->>'key' = 'weight';
    if weight_filter->>'unit' <> 'g'
       or weight_filter->'operators' <> '["eq","gte","lte"]'::jsonb then
        raise exception 'taxonomy smoke: unit or operators were not derived from the metadata definition';
    end if;
    select commerce.search_public_offers(
        'rackets/tennis', 'smoke-brand', '{"weight":{"gte":295,"lte":305}}',
        null, null, null, null, 'recent', 20, 0
    ) into matching;
    if (matching->>'total')::integer <> 1 then
        raise exception 'taxonomy smoke: contextual filters did not match';
    end if;
    select commerce.search_public_offers(
        'rackets/tennis', 'smoke-brand', '{"grip":{"eq":"L1"}}',
        null, null, null, null, 'recent', 20, 0
    ) into matching;
    if (matching->>'total')::integer <> 1 then
        raise exception 'taxonomy smoke: effective variant metadata did not match';
    end if;
    if commerce.effective_variant_metadata(
        (select id from commerce.products where slug = 'taxonomy-racket'),
        (select variant.id from commerce.product_variants variant
         join commerce.products product on product.id = variant.product_id
         where product.slug = 'taxonomy-racket' and variant.combination_key = 'grip:l1')
    ) <> '{"weight":300,"grip":"L1"}'::jsonb then
        raise exception 'taxonomy smoke: effective metadata precedence is incorrect';
    end if;
    select commerce.search_public_offers(
        'rackets/tennis', 'smoke-brand', '{"weight":{"gte":310}}',
        null, null, null, null, 'recent', 20, 0
    ) into excluded;
    if (excluded->>'total')::integer <> 0 then
        raise exception 'taxonomy smoke: numeric filter did not exclude the offer';
    end if;
end;
$$;

select (commerce.upsert_brand(null, '{"slug":"unused-brand","name":"Unused brand"}'::jsonb)->>'id')::bigint unused_brand_id \gset
select (commerce.upsert_category(null, '{"slug":"unused-category","label":"Unused category"}'::jsonb)->>'id')::bigint unused_category_id \gset
select commerce.upsert_custom_field(
    'product', 'unusedField', 'Unused field', 'string', '[]'::jsonb,
    false, false, true, false, false
);
select commerce.delete_brand(:unused_brand_id);
select commerce.delete_category(:unused_category_id);
select commerce.delete_custom_field('product', 'unusedField');

do $$
begin
    if exists (select 1 from commerce.brands where slug = 'unused-brand')
        or exists (select 1 from commerce.categories where full_slug = 'unused-category')
        or exists (select 1 from commerce.custom_field_definitions where entity_type = 'product' and key = 'unusedField') then
        raise exception 'taxonomy smoke: deleted configuration still exists';
    end if;

    begin
        perform commerce.delete_brand((select id from commerce.brands where slug = 'smoke-brand'));
        raise exception 'taxonomy smoke: used brand was deleted';
    exception when others then
        if sqlerrm = 'taxonomy smoke: used brand was deleted'
            or sqlerrm <> 'conflict: brand is used by at least one product' then raise; end if;
    end;
    begin
        perform commerce.delete_category((select id from commerce.categories where full_slug = 'rackets'));
        raise exception 'taxonomy smoke: parent category was deleted';
    exception when others then
        if sqlerrm = 'taxonomy smoke: parent category was deleted'
            or sqlerrm <> 'conflict: category has child categories' then raise; end if;
    end;
    begin
        perform commerce.delete_custom_field('product', 'weight');
        raise exception 'taxonomy smoke: assigned metadata was deleted';
    exception when others then
        if sqlerrm = 'taxonomy smoke: assigned metadata was deleted'
            or sqlerrm <> 'conflict: metadata is assigned to at least one category' then raise; end if;
    end;
end;
$$;

rollback;
