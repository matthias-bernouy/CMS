select commerce_product_matrix_test.seed_product('axis-validation');

select commerce_product_matrix_test.assert_sync_error(
    'axis-validation', '{}'::jsonb, '[]'::jsonb,
    'validation: variant axes must be an array with at most four axes'
);

select commerce_product_matrix_test.assert_sync_error(
    'axis-validation', (
        select jsonb_agg(jsonb_build_object(
            'key', 'axis' || index,
            'label', 'Axis ' || index,
            'values', jsonb_build_array(jsonb_build_object('key', 'one', 'label', 'One'))
        )) from generate_series(1, 5) index
    ), '[]'::jsonb,
    'validation: variant axes must be an array with at most four axes'
);

select commerce_product_matrix_test.assert_sync_error(
    'axis-validation', '[
        {"key":"same","label":"Same","values":[{"key":"one","label":"One"}]},
        {"key":"same","label":"Broken","values":[]}
    ]'::jsonb, '[]'::jsonb,
    'validation: every variant axis needs a key, label, and one to twenty values'
);

select commerce_product_matrix_test.assert_sync_error(
    'axis-validation', '[
        {"key":"same","label":"First","values":[{"key":"one","label":"One"}]},
        {"key":"same","label":"Second","values":[{"key":"two","label":"Two"}]}
    ]'::jsonb, '[]'::jsonb,
    'validation: variant axis keys must be unique'
);

select commerce_product_matrix_test.assert_sync_error(
    'axis-validation', '[{
        "key":"size","label":"Size","values":[
            {"key":"m","label":"Medium"},{"key":"m","label":"Medium again"}
        ]
    }]'::jsonb, '[]'::jsonb,
    'validation: variant value keys must be unique inside an axis'
);

select commerce_product_matrix_test.assert_sync_error(
    'axis-validation', jsonb_build_array(
        jsonb_build_object(
            'key', 'first', 'label', 'First',
            'values', (select jsonb_agg(jsonb_build_object(
                'key', 'a' || index, 'label', 'A ' || index
            )) from generate_series(1, 11) index)
        ),
        jsonb_build_object(
            'key', 'second', 'label', 'Second',
            'values', (select jsonb_agg(jsonb_build_object(
                'key', 'duplicate', 'label', 'B ' || index
            )) from generate_series(1, 10) index)
        )
    ), '[]'::jsonb,
    'validation: variant matrix cannot exceed 100 combinations'
);

select commerce_product_matrix_test.assert_sync_error(
    'axis-validation', jsonb_build_array(
        jsonb_build_object(
            'key', 'first', 'label', 'First',
            'values', (select jsonb_agg(jsonb_build_object(
                'key', 'duplicate', 'label', 'A ' || index
            )) from generate_series(1, 11) index)
        ),
        jsonb_build_object(
            'key', 'second', 'label', 'Second',
            'values', (select jsonb_agg(jsonb_build_object(
                'key', 'b' || index, 'label', 'B ' || index
            )) from generate_series(1, 10) index)
        )
    ), '[]'::jsonb,
    'validation: variant value keys must be unique inside an axis'
);
