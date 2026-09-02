select commerce_product_matrix_test.seed_product('matrix-validation');

select commerce_product_matrix_test.assert_sync_error(
    'matrix-validation', commerce_product_matrix_test.basic_axes(), '{}'::jsonb,
    'validation: variant matrix must be an array'
);

select commerce_product_matrix_test.assert_sync_error(
    'matrix-validation', '[{
        "key":"size","label":"Size","values":[
            {"key":"s","label":"Small"},{"key":"l","label":"Large"}
        ]
    }]'::jsonb, '[{
        "key":"size:s","title":"Small","choices":[{"axisKey":"size","valueKey":"s"}]
    }]'::jsonb,
    'validation: variant matrix does not match the cartesian product'
);

select commerce_product_matrix_test.assert_sync_error(
    'matrix-validation', '[{
        "key":"size","label":"Size","values":[
            {"key":"s","label":"Small"},{"key":"l","label":"Large"}
        ]
    }]'::jsonb, '[
        {"key":"duplicate","title":"First","choices":[]},
        {"key":"duplicate","title":"Second","choices":[]}
    ]'::jsonb,
    'validation: variant combination keys must be unique'
);

select commerce_product_matrix_test.assert_sync_error(
    'matrix-validation', '[{
        "key":"size","label":"Size","values":[{"key":"s","label":"Small"}]
    }]'::jsonb, '[{
        "key":"size:s","title":"Small","choices":[]
    }]'::jsonb,
    'validation: every variant combination must select one value per axis'
);

select commerce_product_matrix_test.assert_sync_error(
    'matrix-validation', '[
        {"key":"size","label":"Size","values":[{"key":"s","label":"Small"}]},
        {"key":"color","label":"Color","values":[{"key":"red","label":"Red"}]}
    ]'::jsonb, '[{
        "key":"invalid","title":"Invalid","choices":[
            {"axisKey":"size","valueKey":"s"},{"axisKey":"size","valueKey":"s"}
        ]
    }]'::jsonb,
    'validation: every variant combination must select each axis exactly once'
);

select commerce_product_matrix_test.assert_sync_error(
    'matrix-validation', '[
        {"key":"size","label":"Size","values":[{"key":"s","label":"Small"}]},
        {"key":"color","label":"Color","values":[{"key":"red","label":"Red"}]}
    ]'::jsonb, '[{
        "key":"unknown","title":"Unknown","choices":[
            {"axisKey":"size","valueKey":"missing"},
            {"axisKey":"color","valueKey":"red"}
        ]
    }]'::jsonb,
    'validation: variant choice is not part of the product axes'
);
