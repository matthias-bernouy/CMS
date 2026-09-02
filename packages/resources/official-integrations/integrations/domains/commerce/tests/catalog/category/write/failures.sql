\ir fixtures.sql

do $$
begin
    if has_function_privilege(
        'anon', 'commerce.sync_category_custom_fields(bigint,jsonb)', 'execute'
    ) or has_function_privilege(
        'authenticated', 'commerce.sync_category_custom_fields(bigint,jsonb)', 'execute'
    ) or not has_function_privilege(
        'service_role', 'commerce.sync_category_custom_fields(bigint,jsonb)', 'execute'
    ) then
        raise exception 'category write failures: function privileges changed';
    end if;
end;
$$;

create function pg_temp.expect_category_sync_error(
    p_category_id bigint,
    p_fields jsonb,
    p_expected text
) returns void language plpgsql as $$
begin
    perform commerce.sync_category_custom_fields(p_category_id, p_fields);
    raise exception 'category write failures: expected %', p_expected;
exception when others then
    if sqlerrm like 'category write failures: expected %' or sqlerrm <> p_expected then
        raise;
    end if;
end;
$$;

select pg_temp.expect_category_sync_error(
    :category_child_id, '{}'::jsonb,
    'validation: category fields must be an array'
);
select pg_temp.expect_category_sync_error(
    :category_child_id,
    (select jsonb_agg(jsonb_build_object('fieldKey', 'writeAlpha'))
     from generate_series(1, 101)),
    'validation: too many category fields'
);
select pg_temp.expect_category_sync_error(
    :category_child_id,
    '[{"fieldKey":"writeAlpha"},{"fieldKey":"writeAlpha"}]'::jsonb,
    'validation: category field keys must be unique'
);
select pg_temp.expect_category_sync_error(
    :category_child_id, '[{"fieldKey":"writeMissing"}]'::jsonb,
    'validation: enabled Product custom field does not exist'
);
select pg_temp.expect_category_sync_error(
    :category_child_id, '[{"fieldKey":"writeDisabled"}]'::jsonb,
    'validation: enabled Product custom field does not exist'
);
select pg_temp.expect_category_sync_error(
    9223372036854775807, '[{"fieldKey":"writeMissing"}]'::jsonb,
    'validation: enabled Product custom field does not exist'
);
select pg_temp.expect_category_sync_error(
    9223372036854775807, '[{"fieldKey":"writeAlpha"}]'::jsonb,
    'validation: category does not exist'
);
select pg_temp.expect_category_sync_error(
    :category_child_id, '[{"fieldKey":"writeAlpha","position":"invalid"}]'::jsonb,
    'invalid input syntax for type integer: "invalid"'
);
select pg_temp.expect_category_sync_error(
    :category_child_id, '[{"fieldKey":"writeAlpha","required":"invalid"}]'::jsonb,
    'invalid input syntax for type boolean: "invalid"'
);

select commerce.sync_category_custom_fields(:category_child_id, '[
    {"fieldKey":"writeAlpha","required":false,"filterable":false,"position":0}
]'::jsonb);

do $$
declare v_category_id bigint := current_setting('test.category_child_id')::bigint;
begin
    begin
        perform commerce.sync_category_custom_fields(v_category_id, '[
            {"fieldKey":"writeBeta","required":true,"filterable":true,"position":1},
            {"fieldKey":"writeMissing","required":false,"filterable":false,"position":2}
        ]'::jsonb);
        raise exception 'category write failures: later invalid field was accepted';
    exception when others then
        if sqlerrm = 'category write failures: later invalid field was accepted'
            or sqlerrm <> 'validation: enabled Product custom field does not exist' then
            raise;
        end if;
    end;
    if (select array_agg(field_key order by field_key)
        from commerce.category_custom_fields where category_id = v_category_id)
        is distinct from array['writeAlpha'] then
        raise exception 'category write failures: failed replacement was not atomic';
    end if;
end;
$$;

rollback;
