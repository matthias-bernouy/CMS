\ir fixture.sql

select commerce.assert_custom_field_patch(
    'product',
    '{"aString":"value","bNumber":12.5,"dEnum":"red"}'::jsonb,
    'admin'
);
select commerce.assert_custom_field_patch(
    'product',
    '{"aString":"value","cBoolean":true,"dEnum":"blue"}'::jsonb,
    'self'
);
select commerce.assert_custom_field_patch(
    'product',
    '{"aString":"value","bNumber":12.5,"cBoolean":false,"dEnum":"red","eDisabled":"legacy"}'::jsonb,
    'system'
);

-- SQL NULL is the historical empty patch; JSON null is a non-object value.
select commerce.assert_custom_field_patch('product', null, 'admin');
select commerce.assert_custom_field_patch('product', '{}'::jsonb, 'self');
select pg_temp.expect_custom_field_patch_error(
    'product', 'null'::jsonb, 'admin',
    'validation: custom fields must be an object'
);

select pg_temp.expect_custom_field_patch_error(
    'product', '{"missing":true}'::jsonb, 'admin',
    'validation: unknown custom field missing for product'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"eDisabled":"legacy"}'::jsonb, 'admin',
    'validation: unknown custom field eDisabled for product'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"bNumber":1}'::jsonb, 'self',
    'forbidden: custom field bNumber is not self editable'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"cBoolean":true}'::jsonb, 'admin',
    'forbidden: custom field cBoolean is not admin editable'
);

select pg_temp.expect_custom_field_patch_error(
    'product', '{"aString":12}'::jsonb, 'admin',
    'validation: custom field aString must be a string'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"bNumber":"12"}'::jsonb, 'admin',
    'validation: custom field bNumber must be a number'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"cBoolean":null}'::jsonb, 'self',
    'validation: custom field cBoolean must be a boolean'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"dEnum":null}'::jsonb, 'admin',
    'validation: custom field dEnum must be a string'
);
select pg_temp.expect_custom_field_patch_error(
    'product', '{"dEnum":"green"}'::jsonb, 'admin',
    'validation: custom field dEnum has an unsupported value'
);

rollback;
