select commerce_product_matrix_test.seed_product('priority');

select commerce_product_matrix_test.assert_sync_error(
    'priority', '[{
        "key":"size","label":"Size","values":[
            {"key":"s","label":"Small"},{"key":"l","label":"Large"}
        ]
    }]'::jsonb, '[
        {"key":"duplicate","title":"First","choices":[]},
        {"key":"duplicate","title":"Second","choices":[]}
    ]'::jsonb,
    'validation: variant combination keys must be unique'
);

do $write_priority$
declare
    v_product_id bigint;
    v_version integer;
    v_payload jsonb := '{
        "variantAxes":[{"key":"invalid","label":"","values":[]}],
        "variantMatrix":{}
    }'::jsonb;
begin
    select product_id, initial_version into v_product_id, v_version
    from commerce_product_matrix_test.products where label = 'priority';
    begin
        perform commerce.upsert_product_read_model(v_product_id, v_payload, null);
        raise exception 'matrix priority: missing version was accepted';
    exception when others then
        if sqlerrm <> 'validation: expected product version is required' then raise; end if;
    end;
    begin
        perform commerce.upsert_product_read_model(v_product_id, v_payload, v_version - 1);
        raise exception 'matrix priority: stale version was accepted';
    exception when others then
        if sqlerrm <> 'conflict: stale product version' then raise; end if;
    end;
    begin
        perform commerce.upsert_product_read_model(9223372036854775807, v_payload, 1);
        raise exception 'matrix priority: missing product was accepted';
    exception when others then
        if sqlerrm <> 'not_found: product' then raise; end if;
    end;
end;
$write_priority$;
