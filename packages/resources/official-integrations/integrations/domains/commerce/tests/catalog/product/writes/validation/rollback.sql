select commerce_product_matrix_test.seed_product('late-rollback');

do $late_fixture$
declare
    v_product_id bigint;
    v_category jsonb;
    v_variant_id bigint;
    v_seller_id bigint;
begin
    select product_id into v_product_id
    from commerce_product_matrix_test.products where label = 'late-rollback';
    v_category := commerce.upsert_category(
        null, '{"slug":"matrix-late-rollback","label":"Matrix late rollback"}'::jsonb
    );
    insert into commerce.product_categories(product_id, category_id, is_primary)
    values (v_product_id, (v_category->>'id')::bigint, true);
    insert into commerce.sellers(
        kind, slug, display_name, verification_status, verified_at, verified_by
    ) values (
        'merchant', 'matrix-late-rollback', 'Matrix late rollback',
        'verified', now(), 'matrix-contract'
    )
    returning id into v_seller_id;
    select id into v_variant_id from commerce.product_variants
    where product_id = v_product_id and combination_key = 'red-s';
    insert into commerce.offers (
        seller_id, product_id, variant_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount, currency
    ) values (
        v_seller_id, v_product_id, v_variant_id, 'matrix-late-rollback-offer',
        'Matrix late rollback offer', 'good', 'active', 'approved', 1000, 'eur'
    );
end;
$late_fixture$;

create temporary table rollback_product as
select product.* from commerce.products product
join commerce_product_matrix_test.products seeded on seeded.product_id = product.id
where seeded.label = 'late-rollback';
create temporary table rollback_categories as
select link.* from commerce.product_categories link join rollback_product product
on product.id = link.product_id;
create temporary table rollback_axes as
select axis.* from commerce.product_variant_axes axis join rollback_product product
on product.id = axis.product_id;
create temporary table rollback_values as
select value.* from commerce.product_variant_axis_values value join rollback_product product
on product.id = value.product_id;
create temporary table rollback_variants as
select variant.* from commerce.product_variants variant join rollback_product product
on product.id = variant.product_id;
create temporary table rollback_selections as
select selection.* from commerce.product_variant_selections selection join rollback_product product
on product.id = selection.product_id;
create temporary table rollback_offers as
select offer.* from commerce.offers offer join rollback_product product
on product.id = offer.product_id;

select commerce_product_matrix_test.assert_sync_error(
    'late-rollback', '[{
        "key":"size","label":"Size","values":[
            {"key":"s","label":"Small"},{"key":"l","label":"Large"}
        ]
    }]'::jsonb, '[
        {"key":"size:s","title":"Small","choices":[{"axisKey":"size","valueKey":"s"}]},
        {"key":"size:l","title":"Large","choices":[{"axisKey":"size","valueKey":"missing"}]}
    ]'::jsonb,
    'validation: variant choice is not part of the product axes'
);

do $late_rollback$
declare v_product_id bigint := (select id from rollback_product);
begin
    if (select jsonb_agg(to_jsonb(row) order by row.id) from commerce.products row
        where row.id = v_product_id)
            is distinct from (select jsonb_agg(to_jsonb(row) order by row.id) from rollback_product row)
       or (select jsonb_agg(to_jsonb(row) order by row.category_id) from commerce.product_categories row
           where row.product_id = v_product_id)
            is distinct from (select jsonb_agg(to_jsonb(row) order by row.category_id) from rollback_categories row)
       or (select jsonb_agg(to_jsonb(row) order by row.id) from commerce.product_variant_axes row
           where row.product_id = v_product_id)
            is distinct from (select jsonb_agg(to_jsonb(row) order by row.id) from rollback_axes row)
       or (select jsonb_agg(to_jsonb(row) order by row.id) from commerce.product_variant_axis_values row
           where row.product_id = v_product_id)
            is distinct from (select jsonb_agg(to_jsonb(row) order by row.id) from rollback_values row)
       or (select jsonb_agg(to_jsonb(row) order by row.id) from commerce.product_variants row
           where row.product_id = v_product_id)
            is distinct from (select jsonb_agg(to_jsonb(row) order by row.id) from rollback_variants row)
       or (select jsonb_agg(to_jsonb(row) order by row.variant_id, row.axis_id)
           from commerce.product_variant_selections row where row.product_id = v_product_id)
            is distinct from (select jsonb_agg(to_jsonb(row) order by row.variant_id, row.axis_id)
                              from rollback_selections row)
       or (select jsonb_agg(to_jsonb(row) order by row.id) from commerce.offers row
           where row.product_id = v_product_id)
            is distinct from (select jsonb_agg(to_jsonb(row) order by row.id) from rollback_offers row) then
        raise exception 'matrix rollback: a late failure changed persisted aggregate state';
    end if;
end;
$late_rollback$;
