\set ON_ERROR_STOP on
begin;
set local role service_role;

select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'category-write-parent', 'label', 'Category write parent'
))->>'id')::bigint category_parent_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'parentId', :category_parent_id,
    'slug', 'category-write-child',
    'label', 'Category write child'
))->>'id')::bigint category_child_id \gset
select set_config('test.category_parent_id', :'category_parent_id', false);
select set_config('test.category_child_id', :'category_child_id', false);

select commerce.upsert_custom_field(
    'product', 'writeAlpha', 'Write alpha', 'string', '[]'::jsonb,
    false, false, true, true, true, 0, true, null
);
select commerce.upsert_custom_field(
    'product', 'writeBeta', 'Write beta', 'enum', '["B1","B2"]'::jsonb,
    false, false, true, true, true, 1, true, null
);
select commerce.upsert_custom_field(
    'product', 'writeNumber', 'Write number', 'number', '[]'::jsonb,
    false, false, true, true, true, 2, true, 'g'
);
select commerce.upsert_custom_field(
    'product', 'writeBoolean', 'Write boolean', 'boolean', '[]'::jsonb,
    false, false, true, true, true, 3, true, null
);
select commerce.upsert_custom_field(
    'product', 'writeDisabled', 'Write disabled', 'string', '[]'::jsonb,
    false, false, true, true, true, 4, false, null
);
