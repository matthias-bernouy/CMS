\ir fixtures.sql
\ir expectations.sql

do $$
declare
    v_result jsonb;
    v_created_at timestamptz;
    v_updated_at timestamptz;
    v_category_id bigint := current_setting('test.category_child_id')::bigint;
begin
    v_result := commerce.sync_category_custom_fields(v_category_id, '[
        {"fieldKey":"writeBeta","required":true,"filterable":true,"position":2},
        {"fieldKey":"writeAlpha","required":false,"filterable":true,"position":0},
        {"fieldKey":"writeNumber","required":true,"filterable":false,"position":1}
    ]'::jsonb);
    if v_result is distinct from jsonb_build_object('fields', jsonb_build_array(
        pg_temp.expected_category_field(
            'writeAlpha', 'Write alpha', 'string', 0, false, true, v_category_id),
        pg_temp.expected_category_field(
            'writeNumber', 'Write number', 'number', 1, true, false, v_category_id, false, 'g'),
        pg_temp.expected_category_field(
            'writeBeta', 'Write beta', 'enum', 2, true, true, v_category_id, false, null,
            '[{"value":"B1","label":"B1"},{"value":"B2","label":"B2"}]'::jsonb)
    )) then
        raise exception 'category write contract: response shape or order changed';
    end if;
    if (select array_agg(field_key order by position, field_key)
        from commerce.category_custom_fields where category_id = v_category_id)
        is distinct from array['writeAlpha', 'writeNumber', 'writeBeta'] then
        raise exception 'category write contract: stored replacement changed';
    end if;
    if v_result->'fields'->1->>'unit' is distinct from 'g'
        or (v_result->'fields'->0->>'filterable')::boolean is distinct from true
        or (v_result->'fields'->2->>'required')::boolean is distinct from true then
        raise exception 'category write contract: projected field values changed';
    end if;

    select created_at, updated_at into v_created_at, v_updated_at
    from commerce.category_custom_fields
    where category_id = v_category_id and field_key = 'writeAlpha';
    perform pg_sleep(0.01);
    v_result := commerce.sync_category_custom_fields(v_category_id, '[
        {"fieldKey":"writeAlpha","required":true,"filterable":false,"position":3},
        {"fieldKey":"writeBoolean","required":false,"filterable":true,"position":1}
    ]'::jsonb);
    if v_result is distinct from jsonb_build_object('fields', jsonb_build_array(
        pg_temp.expected_category_field(
            'writeBoolean', 'Write boolean', 'boolean', 1, false, true, v_category_id),
        pg_temp.expected_category_field(
            'writeAlpha', 'Write alpha', 'string', 3, true, false, v_category_id)
    )) then
        raise exception 'category write contract: replacement response changed';
    end if;
    if (select count(*) from commerce.category_custom_fields
        where category_id = v_category_id) <> 2
        or not exists (select 1 from commerce.category_custom_fields
            where category_id = v_category_id and field_key = 'writeBoolean') then
        raise exception 'category write contract: update/delete semantics changed';
    end if;
    if not exists (select 1 from commerce.category_custom_fields
        where category_id = v_category_id and field_key = 'writeAlpha'
          and required and not filterable and position = 3
          and created_at = v_created_at and updated_at >= v_updated_at) then
        raise exception 'category write contract: update semantics changed';
    end if;
end;
$$;

select commerce.sync_category_custom_fields(:category_parent_id, '[
    {"fieldKey":"writeNumber","required":false,"filterable":true,"position":0}
]'::jsonb);
select commerce.sync_category_custom_fields(:category_child_id, '[]'::jsonb);

do $$
declare
    v_result jsonb;
    v_category_id bigint := current_setting('test.category_child_id')::bigint;
begin
    v_result := commerce.category_custom_field_schema(v_category_id);
    if v_result is distinct from jsonb_build_object('fields', jsonb_build_array(
        pg_temp.expected_category_field(
            'writeNumber', 'Write number', 'number', 0, false, true,
            current_setting('test.category_parent_id')::bigint, true, 'g')
    )) or exists (select 1 from commerce.category_custom_fields
            where category_id = v_category_id) then
        raise exception 'category write contract: empty direct replacement changed inheritance';
    end if;
    v_result := commerce.sync_category_custom_fields(9223372036854775807, '[]'::jsonb);
    if v_result is distinct from '{"fields":[]}'::jsonb then
        raise exception 'category write contract: empty missing-category response changed';
    end if;
end;
$$;

rollback;
