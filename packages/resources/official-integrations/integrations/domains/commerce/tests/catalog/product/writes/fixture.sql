drop schema if exists commerce_product_matrix_test cascade;
create schema commerce_product_matrix_test;

create table commerce_product_matrix_test.products (
    label text primary key,
    product_id bigint not null,
    initial_version integer not null
);

create function commerce_product_matrix_test.basic_axes()
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select '[
        {"key":"size","label":"Size","position":1,"values":[
            {"key":"l","label":"Large","value":"L","position":1},
            {"key":"s","label":"Small","value":"S","position":0}
        ]},
        {"key":"color","label":"Color","position":0,"values":[
            {"key":"blue","label":"Blue","value":"blue","position":1},
            {"key":"red","label":"Red","value":"red","position":0}
        ]}
    ]'::jsonb;
$$;

create function commerce_product_matrix_test.basic_matrix()
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select '[
        {"key":"blue-l","title":"Blue / Large","position":3,"choices":[
            {"axisKey":"size","valueKey":"l"},{"axisKey":"color","valueKey":"blue"}
        ]},
        {"key":"red-l","title":"Red / Large","position":2,"choices":[
            {"axisKey":"size","valueKey":"l"},{"axisKey":"color","valueKey":"red"}
        ]},
        {"key":"blue-s","title":"Blue / Small","position":1,"choices":[
            {"axisKey":"size","valueKey":"s"},{"axisKey":"color","valueKey":"blue"}
        ]},
        {"key":"red-s","title":"Red / Small","position":0,"choices":[
            {"axisKey":"size","valueKey":"s"},{"axisKey":"color","valueKey":"red"}
        ]}
    ]'::jsonb;
$$;

create function commerce_product_matrix_test.seed_product(p_label text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_bundle jsonb;
    v_product_id bigint;
begin
    v_bundle := commerce.upsert_product_read_model(null, jsonb_build_object(
        'slug', 'matrix-contract-' || p_label,
        'title', 'Matrix contract ' || p_label,
        'status', 'active',
        'visibility', 'public',
        'variantAxes', commerce_product_matrix_test.basic_axes(),
        'variantMatrix', commerce_product_matrix_test.basic_matrix()
    ), null);
    v_product_id := (v_bundle->'product'->>'id')::bigint;
    insert into commerce_product_matrix_test.products
    values (p_label, v_product_id, (v_bundle->'product'->>'version')::integer);
    return v_product_id;
end;
$$;

create function commerce_product_matrix_test.assert_sync_error(
    p_label text,
    p_axes jsonb,
    p_matrix jsonb,
    p_expected_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_product_id bigint;
begin
    select product_id into strict v_product_id
    from commerce_product_matrix_test.products where label = p_label;
    begin
        perform commerce.sync_product_variant_matrix(v_product_id, p_axes, p_matrix);
        raise exception 'matrix contract: expected failure was accepted';
    exception when others then
        if sqlerrm <> p_expected_message then
            raise exception 'matrix contract: expected %, got %', p_expected_message, sqlerrm;
        end if;
    end;
end;
$$;

create function commerce_product_matrix_test.assert_sync_diagnostic(
    p_label text,
    p_axes jsonb,
    p_matrix jsonb,
    p_expected_state text,
    p_expected_message text,
    p_expected_constraint text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_product_id bigint;
    v_state text;
    v_message text;
    v_constraint text;
begin
    select product_id into strict v_product_id
    from commerce_product_matrix_test.products where label = p_label;
    begin
        perform commerce.sync_product_variant_matrix(v_product_id, p_axes, p_matrix);
        raise exception 'matrix diagnostic: expected failure was accepted';
    exception when others then
        get stacked diagnostics
            v_state = returned_sqlstate,
            v_message = message_text,
            v_constraint = constraint_name;
        if v_state is distinct from p_expected_state
            or v_message is distinct from p_expected_message
            or nullif(v_constraint, '') is distinct from p_expected_constraint then
            raise exception 'matrix diagnostic: expected (%, %, %), got (%, %, %)',
                p_expected_state, p_expected_message, p_expected_constraint,
                v_state, v_message, nullif(v_constraint, '');
        end if;
    end;
end;
$$;

create function commerce_product_matrix_test.cleanup()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from commerce.offers offer using commerce_product_matrix_test.products seeded
    where offer.product_id = seeded.product_id;
    delete from commerce.product_variant_selections selection
    using commerce_product_matrix_test.products seeded
    where selection.product_id = seeded.product_id;
    delete from commerce.product_variant_axes axis
    using commerce_product_matrix_test.products seeded
    where axis.product_id = seeded.product_id;
    delete from commerce.product_variants variant
    using commerce_product_matrix_test.products seeded
    where variant.product_id = seeded.product_id;
    delete from commerce.product_categories link
    using commerce_product_matrix_test.products seeded
    where link.product_id = seeded.product_id;
    delete from commerce.products product
    using commerce_product_matrix_test.products seeded
    where product.id = seeded.product_id;
end;
$$;

grant usage on schema commerce_product_matrix_test to service_role;
grant select, insert on commerce_product_matrix_test.products to service_role;
grant execute on all functions in schema commerce_product_matrix_test to service_role;
