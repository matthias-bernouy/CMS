select pg_catalog.pg_sleep(0.01);
begin;
set local role service_role;
create temporary table previous_product as
select product.* from commerce.products product
join commerce_product_matrix_test.products seeded on seeded.product_id = product.id
where seeded.label = 'lifecycle';
create temporary table previous_axes as
select axis.* from commerce.product_variant_axes axis
join previous_product product on product.id = axis.product_id;
create temporary table previous_values as
select axis.key axis_key, axis_value.*
from commerce.product_variant_axis_values axis_value
join previous_axes axis on axis.id = axis_value.axis_id;
create temporary table previous_variants as
select variant.* from commerce.product_variants variant
join previous_product product on product.id = variant.product_id;
create temporary table previous_offers as
select offer.* from commerce.offers offer
join previous_product product on product.id = offer.product_id;

select commerce.upsert_product_read_model(
    product.id,
    jsonb_build_object(
        'variantAxes', commerce_product_matrix_test.basic_axes(),
        'variantMatrix', commerce_product_matrix_test.basic_matrix()
    ),
    product.version
)
from previous_product product;

do $identity_contract$
declare
    v_product_id bigint := (select id from previous_product);
begin
    if exists (
        select 1 from previous_variants old
        full join commerce.product_variants current
          on current.product_id = old.product_id
         and current.combination_key = old.combination_key
        where coalesce(old.product_id, current.product_id) = v_product_id
          and coalesce(old.generated_from_axes, current.generated_from_axes)
          and (old.id is null or current.id is null or current.id <> old.id
            or current.version <> old.version + 1
            or current.updated_at <= old.updated_at)
    ) or exists (
        select 1 from previous_axes old
        full join commerce.product_variant_axes current
          on current.product_id = old.product_id and current.key = old.key
        where coalesce(old.product_id, current.product_id) = v_product_id
          and (old.id is null or current.id is null or current.id = old.id)
    ) or exists (
        select 1 from previous_values old
        full join (
            select axis.key axis_key, axis_value.*
            from commerce.product_variant_axis_values axis_value
            join commerce.product_variant_axes axis on axis.id = axis_value.axis_id
        ) current on current.product_id = old.product_id
          and current.axis_key = old.axis_key and current.key = old.key
        where coalesce(old.product_id, current.product_id) = v_product_id
          and (old.id is null or current.id is null or current.id = old.id)
    ) or (select version from commerce.products where id = v_product_id)
            <> (select version + 1 from previous_product)
       or (select updated_at from commerce.products where id = v_product_id)
            <= (select updated_at from previous_product)
       or exists (select 1 from commerce.product_variants current
           join previous_variants old on old.id = current.id
           where not current.generated_from_axes
             and (current.version <> old.version or current.updated_at <> old.updated_at))
       or (select jsonb_object_agg(slug, jsonb_build_array(publication_status, version))
           from commerce.offers where product_id = v_product_id)
          <> '{"matrix-offer-manual":["paused",2],
               "matrix-offer-red-s":["active",1],
               "matrix-offer-red-l":["active",1]}'::jsonb then
        raise exception 'matrix lifecycle: identity, revision, timestamp, or offer contract changed';
    end if;
end;
$identity_contract$;

select commerce.upsert_product_read_model(
    product.id,
    '{"variantAxes":[
        {"key":"size","label":"Size","position":1,"values":[
            {"key":"s","label":"Small","value":"S","position":0}]},
        {"key":"color","label":"Color","position":0,"values":[
            {"key":"blue","label":"Blue","value":"blue","position":1},
            {"key":"red","label":"Red","value":"red","position":0}]}
    ],"variantMatrix":[
        {"key":"blue-s","title":"Blue / Small","position":1,"choices":[
            {"axisKey":"size","valueKey":"s"},{"axisKey":"color","valueKey":"blue"}]},
        {"key":"red-s","title":"Red / Small","position":0,"choices":[
            {"axisKey":"size","valueKey":"s"},{"axisKey":"color","valueKey":"red"}]}
    ]}'::jsonb,
    (select version from commerce.products where id = product.id)
)
from previous_product product;

do $shrink_contract$
declare
    v_product_id bigint := (select id from previous_product);
begin
    if (select jsonb_object_agg(combination_key, status)
        from commerce.product_variants
        where product_id = v_product_id and generated_from_axes)
        <> '{"red-s":"active","blue-s":"active","red-l":"archived","blue-l":"archived"}'::jsonb
       or (select status from commerce.product_variants
           where product_id = v_product_id and not generated_from_axes) <> 'active'
       or (select jsonb_object_agg(slug, jsonb_build_array(publication_status, version))
           from commerce.offers where product_id = v_product_id)
          <> '{"matrix-offer-manual":["paused",2],
               "matrix-offer-red-s":["active",1],
               "matrix-offer-red-l":["paused",2]}'::jsonb then
        raise exception 'matrix lifecycle: shrink changed variant or offer semantics';
    end if;
end;
$shrink_contract$;

select commerce.upsert_product_read_model(
    product.id, '{"variantAxes":[],"variantMatrix":[]}'::jsonb,
    (select version from commerce.products where id = product.id)
)
from previous_product product;

do $clear_contract$
declare
    v_product_id bigint := (select id from previous_product);
begin
    if exists (select 1 from commerce.product_variant_axes where product_id = v_product_id)
       or exists (select 1 from commerce.product_variant_axis_values where product_id = v_product_id)
       or exists (select 1 from commerce.product_variant_selections where product_id = v_product_id)
       or exists (select 1 from commerce.product_variants
            where product_id = v_product_id and generated_from_axes and status <> 'archived')
       or (select status from commerce.product_variants
            where product_id = v_product_id and not generated_from_axes) <> 'active'
       or (select jsonb_object_agg(slug, jsonb_build_array(publication_status, version))
           from commerce.offers where product_id = v_product_id)
          <> '{"matrix-offer-manual":["paused",2],
               "matrix-offer-red-s":["paused",2],
               "matrix-offer-red-l":["paused",2]}'::jsonb then
        raise exception 'matrix lifecycle: clear changed archive, manual, or offer semantics';
    end if;
end;
$clear_contract$;
rollback;

begin;
select commerce_product_matrix_test.cleanup();
delete from commerce.sellers where slug = 'matrix-contract-seller';
commit;
drop schema commerce_product_matrix_test cascade;
