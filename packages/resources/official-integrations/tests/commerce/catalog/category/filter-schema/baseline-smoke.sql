\set ON_ERROR_STOP on

begin;
set local role service_role;

select (commerce.upsert_category(null, '{"slug":"filter-baseline-root","label":"Filter baseline root"}'::jsonb)->>'id')::bigint root_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'parentId', :root_id,
    'slug', 'filter-baseline-child',
    'label', 'Filter baseline child'
))->>'id')::bigint category_id \gset

select commerce.upsert_custom_field(
    'product', 'filterBaselineShared', 'Shared override', 'string', '[]'::jsonb,
    false, false, true, true, false, 0, true, 'shared-unit'
);
select commerce.upsert_custom_field(
    'product', 'filterBaselineGrip', 'Grip', 'enum', '["L2","L1"]'::jsonb,
    false, false, true, true, false, 0, true, null
);
select commerce.upsert_custom_field(
    'product', 'filterBaselineWeight', 'Weight', 'number', '[]'::jsonb,
    false, false, true, true, false, 0, true, 'g'
);
select commerce.upsert_custom_field(
    'product', 'filterBaselineCollectible', 'Collectible', 'boolean', '[]'::jsonb,
    false, false, true, true, false, 0, true, null
);
select commerce.upsert_custom_field(
    'product', 'filterBaselinePrivate', 'Private', 'string', '[]'::jsonb,
    false, false, true, false, false, 0, true, null
);
select commerce.upsert_custom_field(
    'product', 'filterBaselineDisabled', 'Disabled', 'string', '[]'::jsonb,
    false, false, true, true, false, 0, false, null
);

insert into commerce.category_custom_fields (
    category_id, entity_type, field_key, required, filterable, position, unit, operators
) values
    (:root_id, 'product', 'filterBaselineShared', false, true, 99, 'root-unit', '["eq"]'),
    (:category_id, 'product', 'filterBaselineShared', true, false, 1, 'child-unit', '["in"]'),
    (:root_id, 'product', 'filterBaselineGrip', false, true, 2, null, '["eq"]'),
    (:root_id, 'product', 'filterBaselineWeight', false, true, 2, 'kg', '["eq"]'),
    (:category_id, 'product', 'filterBaselineCollectible', false, false, 3, null, '[]'),
    (:root_id, 'product', 'filterBaselinePrivate', false, true, 0, null, '["eq"]'),
    (:root_id, 'product', 'filterBaselineDisabled', false, true, 0, null, '["eq"]');

update commerce.categories
set status = 'inactive'
where id = :root_id;

do $$
declare
    v_root_id bigint := (
        select id from commerce.categories where full_slug = 'filter-baseline-root'
    );
    v_category_id bigint := (
        select id from commerce.categories
        where full_slug = 'filter-baseline-root/filter-baseline-child'
    );
    v_actual jsonb;
    v_expected jsonb;
begin
    v_actual := commerce.offer_filter_schema(
        'filter-baseline-root/filter-baseline-child'
    );
    v_expected := jsonb_build_object(
        'category', jsonb_build_object(
            'id', v_category_id,
            'parentId', v_root_id,
            'slug', 'filter-baseline-child',
            'fullSlug', 'filter-baseline-root/filter-baseline-child',
            'label', 'Filter baseline child'
        ),
        'fields', jsonb_build_array(
            jsonb_build_object(
                'key', 'filterBaselineShared', 'label', 'Shared override',
                'type', 'string', 'options', '[]'::jsonb,
                'required', true, 'filterable', false, 'position', 1,
                'unit', 'shared-unit', 'operators', '["eq","in"]'::jsonb
            ),
            jsonb_build_object(
                'key', 'filterBaselineGrip', 'label', 'Grip',
                'type', 'enum', 'options', '["L2","L1"]'::jsonb,
                'required', false, 'filterable', true, 'position', 2,
                'unit', null, 'operators', '["eq","in"]'::jsonb
            ),
            jsonb_build_object(
                'key', 'filterBaselineWeight', 'label', 'Weight',
                'type', 'number', 'options', '[]'::jsonb,
                'required', false, 'filterable', true, 'position', 2,
                'unit', 'g', 'operators', '["eq","gte","lte"]'::jsonb
            ),
            jsonb_build_object(
                'key', 'filterBaselineCollectible', 'label', 'Collectible',
                'type', 'boolean', 'options', '[]'::jsonb,
                'required', false, 'filterable', false, 'position', 3,
                'unit', null, 'operators', '["eq"]'::jsonb
            )
        )
    );

    if v_actual is distinct from v_expected then
        raise exception 'offer filter baseline: expected %, got %', v_expected, v_actual;
    end if;
    if exists (
        select 1 from jsonb_array_elements(v_actual->'fields') field
        where field->>'key' in ('filterBaselinePrivate', 'filterBaselineDisabled')
    ) then
        raise exception 'offer filter baseline: private or disabled field was exposed';
    end if;
    if (select status from commerce.categories where id = v_root_id) <> 'inactive' then
        raise exception 'offer filter baseline: parent fixture must remain inactive';
    end if;

    if commerce.offer_filter_schema('filter-baseline-missing') is not null then
        raise exception 'offer filter baseline: missing category returned a schema';
    end if;
    update commerce.categories set status = 'inactive' where id = v_category_id;
    if commerce.offer_filter_schema(
        'filter-baseline-root/filter-baseline-child'
    ) is not null then
        raise exception 'offer filter baseline: inactive category returned a schema';
    end if;
end;
$$;

rollback;
