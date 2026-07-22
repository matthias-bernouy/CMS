\ir fixture.sql

-- Structural and bounded-input failures precede actor and field validation.
select pg_temp.expect_custom_field_patch_error(
    'product', '[]'::jsonb, 'invalid',
    'validation: custom fields must be an object'
);
select pg_temp.expect_custom_field_patch_error(
    'product', jsonb_build_object('aString', repeat('x', 70000)), 'invalid',
    'validation: custom fields exceed 64 KiB'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"missing":true}'::jsonb, 'invalid',
    'forbidden: invalid custom field actor'
);

-- Permissions precede value validation for the same definition.
select pg_temp.expect_custom_field_patch_error(
    'product', '{"bNumber":"wrong"}'::jsonb, 'self',
    'forbidden: custom field bNumber is not self editable'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"cBoolean":"wrong"}'::jsonb, 'admin',
    'forbidden: custom field cBoolean is not admin editable'
);

-- Enum type validation precedes membership validation.
select pg_temp.expect_custom_field_patch_error(
    'product', '{"dEnum":10}'::jsonb, 'admin',
    'validation: custom field dEnum must be a string'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"dEnum":"unsupported"}'::jsonb, 'admin',
    'validation: custom field dEnum has an unsupported value'
);

-- jsonb_each canonical traversal order defines the first reported field error.
do $$
declare v_keys text[];
begin
    select array_agg(key) into v_keys
    from jsonb_each('{"zMissing":true,"aString":12}'::jsonb);
    if v_keys is distinct from array['aString', 'zMissing'] then
        raise exception 'custom-field contract: unexpected jsonb traversal order %', v_keys;
    end if;
end;
$$;
select pg_temp.expect_custom_field_patch_error(
    'product', '{"zMissing":true,"aString":12}'::jsonb, 'admin',
    'validation: custom field aString must be a string'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"zMissing":true,"aString":"valid"}'::jsonb, 'admin',
    'validation: unknown custom field zMissing for product'
);

rollback;
